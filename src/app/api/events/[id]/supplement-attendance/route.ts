import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, getSessionCheckIns, saveSessionCheckIn, saveRegistrationExtrasBulk } from '@/lib/constants/event-meta-store';

// POST: Super Admin manually adds attendance for CTV/BTC by session
// Bypasses: event closed status, phone requirement, registration requirement
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Only super admin can use this
  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  if (!isSuperAdmin) {
    return NextResponse.json({
      success: false,
      error: 'Chỉ Super Admin mới có quyền bổ sung điểm danh sau khi sự kiện kết thúc.',
    }, { status: 403 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  try {
    const body = await req.json();
    const {
      mssv_list = [],          // Array of MSSVs
      session_id = 'main',     // Which session to add attendance to
      role_type = 'volunteer', // 'volunteer' | 'organizer'
      reason = '',             // Reason for manual addition
    } = body;

    if (!Array.isArray(mssv_list) || mssv_list.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Danh sách MSSV không được để trống',
      }, { status: 400 });
    }

    // Clean and deduplicate
    const cleanedMssvs = Array.from(
      new Set(
        mssv_list
          .map((m: any) => String(m).trim().toUpperCase())
          .filter((m: string) => m.length >= 4 && m.length <= 20)
      )
    );

    if (cleanedMssvs.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Không tìm thấy MSSV hợp lệ',
      }, { status: 400 });
    }

    // Fetch event, meta, users, and existing checkins in parallel
    const [
      { data: event, error: eventErr },
      meta,
      { data: existingUsers },
      existingCheckins
    ] = await Promise.all([
      supabase.from('events').select('event_id, event_name, event_date, status').eq('event_id', resolvedParams.id).single(),
      getEventMeta(supabase, resolvedParams.id),
      supabase.from('users').select('mssv, full_name, class_id, email').in('mssv', cleanedMssvs),
      getSessionCheckIns(supabase, resolvedParams.id)
    ]);

    if (eventErr || !event) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
    }

    const sessions = meta.sessions || [];
    const targetSession = sessions.find((s: any) => s.id === session_id);
    const sessionName = targetSession?.name || (session_id === 'main' ? 'Buổi chính' : session_id);

    const userMap = new Map<string, { full_name: string; class_id: string; email: string }>();
    (existingUsers || []).forEach((u: any) => {
      userMap.set(u.mssv.toUpperCase(), {
        full_name: u.full_name || u.mssv,
        class_id: u.class_id || 'PTIT-HCM',
        email: u.email || `${u.mssv.toLowerCase()}@student.ptithcm.edu.vn`,
      });
    });

    const now = new Date().toISOString();
    const actorEmail = auth.email;
    const addedMssvs: string[] = [];
    const skippedMssvs: string[] = [];

    for (const mssv of cleanedMssvs) {
      // Check if already checked in for this session
      const alreadyCheckedIn = existingCheckins.some(
        (c) => c.mssv.toUpperCase() === mssv && c.session_id === session_id
      );

      if (alreadyCheckedIn) {
        skippedMssvs.push(mssv);
        continue;
      }

      const userInfo = userMap.get(mssv);

      // Auto-create user if not exists
      if (!userInfo) {
        try {
          await supabase.from('users').upsert({
            mssv,
            email: `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
            full_name: mssv,
            class_id: 'PTIT-HCM',
          }, { onConflict: 'mssv' });
        } catch {}
      }

      // 5. Auto-register if not registered
      try {
        await supabase.from('event_registrations').upsert({
          event_id: resolvedParams.id,
          mssv,
          email: userInfo?.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
          full_name: userInfo?.full_name || mssv,
          class_id: userInfo?.class_id || 'PTIT-HCM',
          role_type,
          attended: true,
          attended_at: now,
          created_at: now,
        }, { onConflict: 'event_id,mssv' });
      } catch {}

      // 6. Update attended = true if already registered
      try {
        await supabase
          .from('event_registrations')
          .update({ attended: true, attended_at: now, role_type })
          .eq('event_id', resolvedParams.id)
          .eq('mssv', mssv);
      } catch {}

      // 7. Save session checkin
      await saveSessionCheckIn(supabase, {
        event_id: resolvedParams.id,
        mssv,
        session_id,
        session_name: sessionName,
        checked_at: now,
        checked_by: `Bổ sung bởi SA: ${actorEmail}`,
      });

      // 8. Upsert into check_ins table
      try {
        await supabase.from('check_ins').upsert({
          event_id: resolvedParams.id,
          mssv,
          participate_role: role_type === 'organizer' ? 'organizer' : 'volunteer',
          checked_by: `Bổ sung bởi SA: ${actorEmail} | ${reason || 'Bổ sung sau CTR'}`,
          created_at: now,
        } as any, { onConflict: 'event_id,mssv' });
      } catch {}

      addedMssvs.push(mssv);
    }

    // 9. Save registration extras with audit trail
    if (addedMssvs.length > 0) {
      const extrasMap: Record<string, any> = {};
      for (const mssv of addedMssvs) {
        const userInfo = userMap.get(mssv);
        extrasMap[mssv] = {
          review_status: 'accepted',
          note: `Bổ sung điểm danh ${sessionName} bởi ${actorEmail} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${reason ? ` | Lý do: ${reason}` : ''}`,
          imported_by: actorEmail,
          imported_at: now,
          manual_supplement: true,
        };
      }
      await saveRegistrationExtrasBulk(supabase, resolvedParams.id, extrasMap);
    }

    return NextResponse.json({
      success: true,
      data: {
        added: addedMssvs.length,
        skipped: skippedMssvs.length,
        added_list: addedMssvs,
        skipped_list: skippedMssvs,
        session_name: sessionName,
        added_by: actorEmail,
      },
      message: `Đã bổ sung điểm danh "${sessionName}" cho ${addedMssvs.length} sinh viên (${role_type === 'organizer' ? 'BTC' : 'CTV'}).${
        skippedMssvs.length > 0 ? ` Bỏ qua ${skippedMssvs.length} SV đã điểm danh trước đó.` : ''
      }`,
    });
  } catch (err: any) {
    console.error('Manual supplement attendance error:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Lỗi hệ thống khi bổ sung điểm danh',
    }, { status: 500 });
  }
}
