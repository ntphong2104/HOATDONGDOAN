import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  const isYouthUnion =
    auth.tier === 'youth_union' ||
    auth.email.toLowerCase().includes('doanthanhnien') ||
    auth.email.toLowerCase().includes('bchdoan');

  // Strict RBAC: Only Super Admin and Youth Union can bulk import
  if (!isSuperAdmin && !isYouthUnion) {
    return NextResponse.json(
      { success: false, error: 'Chỉ Đoàn Thanh Niên Học Viện và Ban Quản Trị Super Admin mới có quyền nạp danh sách sinh viên!' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      mssv_list = [],
      participate_role = 'participant',
      mode = 'checkin', // 'checkin' | 'register'
    } = body;

    if (!Array.isArray(mssv_list) || mssv_list.length === 0) {
      return NextResponse.json({ success: false, error: 'Danh sách MSSV không được để trống' }, { status: 400 });
    }

    // Clean, uppercase, and deduplicate MSSV list
    const cleanedMssvs = Array.from(
      new Set(
        mssv_list
          .map((m: any) => String(m).trim().toUpperCase())
          .filter((m: string) => m.length >= 4 && m.length <= 20)
      )
    );

    if (cleanedMssvs.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy MSSV hợp lệ trong danh sách cung cấp' }, { status: 400 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    // Verify target event exists
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('event_id, event_name, semester')
      .eq('event_id', resolvedParams.id)
      .maybeSingle();

    if (eventErr || !event) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy thông tin sự kiện' }, { status: 404 });
    }

    // Fetch existing student info from `users` table for full_name and class_id
    const { data: existingUsers } = await supabase
      .from('users')
      .select('mssv, full_name, class_id, email')
      .in('mssv', cleanedMssvs);

    const userMap = new Map<string, { full_name: string; class_id: string; email?: string }>();
    (existingUsers || []).forEach((u: any) => {
      userMap.set(u.mssv.toUpperCase(), {
        full_name: u.full_name || u.mssv,
        class_id: u.class_id || '',
        email: u.email || `${u.mssv.toLowerCase()}@student.ptithcm.edu.vn`,
      });
    });

    const now = new Date().toISOString();
    const actorEmail = auth.email;

    if (mode === 'checkin') {
      // Prepare records for `check_ins`
      const checkinRecords = cleanedMssvs.map((mssv) => {
        const uInfo = userMap.get(mssv);
        return {
          event_id: resolvedParams.id,
          mssv,
          participate_role: participate_role || 'participant',
          checked_by: `Nạp bởi ${actorEmail}`,
          created_at: now,
        };
      });

      // Upsert into check_ins to avoid duplicates
      const { error: insertErr } = await supabase
        .from('check_ins')
        .upsert(checkinRecords, { onConflict: 'event_id,mssv' });

      if (insertErr) {
        console.error('Bulk checkin error:', insertErr);
        // Fallback: try individual inserts ignoring duplicates
        for (const record of checkinRecords) {
          try {
            await supabase.from('check_ins').insert(record);
          } catch {}
        }
      }

      // Also mark as attended in `event_registrations` if registration exists
      try {
        await supabase
          .from('event_registrations')
          .update({ attended: true, attended_at: now })
          .eq('event_id', resolvedParams.id)
          .in('mssv', cleanedMssvs);
      } catch {}

      return NextResponse.json({
        success: true,
        count: cleanedMssvs.length,
        message: `Đã nạp và điểm danh thành công ${cleanedMssvs.length} sinh viên vào sự kiện "${event.event_name}".`,
      });
    } else {
      // Mode: Pre-register into `event_registrations`
      const regRecords = cleanedMssvs.map((mssv) => {
        const uInfo = userMap.get(mssv);
        return {
          event_id: resolvedParams.id,
          mssv,
          full_name: uInfo?.full_name || mssv,
          class_id: uInfo?.class_id || '',
          role_type: participate_role === 'volunteer' ? 'volunteer' : 'participant',
          status: 'registered',
          attended: false,
          created_at: now,
        };
      });

      const { error: regErr } = await supabase
        .from('event_registrations')
        .upsert(regRecords, { onConflict: 'event_id,mssv' });

      if (regErr) {
        console.error('Bulk registration error:', regErr);
        for (const record of regRecords) {
          try {
            await supabase.from('event_registrations').insert(record);
          } catch {}
        }
      }

      return NextResponse.json({
        success: true,
        count: cleanedMssvs.length,
        message: `Đã nạp thành công ${cleanedMssvs.length} sinh viên vào danh sách đăng ký sự kiện "${event.event_name}".`,
      });
    }
  } catch (err: any) {
    console.error('Import students error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi hệ thống khi nạp danh sách' },
      { status: 500 }
    );
  }
}
