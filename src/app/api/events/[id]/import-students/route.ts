import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { saveRegistrationExtra } from '@/lib/constants/event-meta-store';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  const isYouthUnion =
    auth.tier === 'youth_union' ||
    auth.email.toLowerCase().includes('doanthanhnien') ||
    auth.email.toLowerCase().includes('bchdoan');

  // Verify target event exists
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('event_id, event_name, semester, created_by')
    .eq('event_id', resolvedParams.id)
    .maybeSingle();

  if (eventErr || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy thông tin sự kiện' }, { status: 404 });
  }

  // Check if user is Event Admin or Creator
  const { data: eventRole } = await supabase
    .from('event_roles')
    .select('role_type')
    .eq('event_id', resolvedParams.id)
    .eq('email', auth.email)
    .maybeSingle();

  const isCreator = event?.created_by && event.created_by.toLowerCase() === auth.email.toLowerCase();
  const isEventAdmin = eventRole?.role_type === 'event_admin';

  if (!isSuperAdmin && !isYouthUnion && !isEventAdmin && !isCreator) {
    return NextResponse.json(
      { success: false, error: 'Bạn không có quyền nạp danh sách cho sự kiện này' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      mssv_list = [],
      participate_role = 'participant',
      mode = 'checkin', // 'checkin' | 'register'
      department_id = null,
      department_name = null,
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

    // Fetch existing student info from `users` table for full_name and class_id
    const { data: existingUsers } = await supabase
      .from('users')
      .select('mssv, full_name, class_id, email, phone, gender')
      .in('mssv', cleanedMssvs);

    const userMap = new Map<string, { full_name: string; class_id: string; email?: string; phone?: string; gender?: string }>();
    (existingUsers || []).forEach((u: any) => {
      userMap.set(u.mssv.toUpperCase(), {
        full_name: u.full_name || u.mssv,
        class_id: u.class_id || '',
        email: u.email || `${u.mssv.toLowerCase()}@student.ptithcm.edu.vn`,
        phone: u.phone || '',
        gender: u.gender || '',
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

      // If imported as volunteer / CTV, link to department and set accepted status in registration extra store
      if (participate_role === 'volunteer') {
        for (const mssv of cleanedMssvs) {
          const uInfo = userMap.get(mssv);
          await saveRegistrationExtra(supabase, resolvedParams.id, mssv, {
            department_id: department_id || null,
            department_name: department_name || (department_id ? 'Ban Chuyên Trách' : 'Ban CTV'),
            phone: uInfo?.phone || '',
            gender: uInfo?.gender || '',
            review_status: 'accepted',
            note: 'Nạp danh sách trực tiếp bởi Ban Tổ Chức',
          });
        }
      }

      return NextResponse.json({
        success: true,
        count: cleanedMssvs.length,
        message: participate_role === 'volunteer'
          ? `Đã nạp thành công ${cleanedMssvs.length} CTV vào ${department_name ? `"${department_name}"` : 'danh sách CTV'} và tự động duyệt Trúng Tuyển!`
          : `Đã nạp thành công ${cleanedMssvs.length} sinh viên vào danh sách đăng ký sự kiện "${event.event_name}".`,
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
