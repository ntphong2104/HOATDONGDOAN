import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, saveEventMeta, saveRegistrationExtrasBulk } from '@/lib/constants/event-meta-store';

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
  const isYouthUnion = auth.tier === 'youth_union' || (auth.email || '').includes('doanthanhnien');
  const isEventAdmin = auth.isEventAdmin;

  // 1. Fetch Event
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const isEventCreator = event.created_by && auth.email && event.created_by.toLowerCase() === auth.email.toLowerCase();

  // Allow Super Admin, Youth Union, Event Admin, and Event Creator
  if (!isSuperAdmin && !isYouthUnion && !isEventAdmin && !isEventCreator) {
    return NextResponse.json(
      { success: false, error: 'Bạn không có quyền nạp danh sách cho sự kiện này' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      mssv_list = [],
      students_data = [],
      participate_role = 'participant',
      mode = 'checkin', // 'checkin' | 'register'
      department_id = null,
      department_name = null,
    } = body;

    if (!Array.isArray(mssv_list) || mssv_list.length === 0) {
      return NextResponse.json({ success: false, error: 'Danh sách MSSV không được để trống' }, { status: 400 });
    }

    // Map student structured data if supplied from Excel
    const studentDataMap = new Map<string, {
      full_name?: string;
      class_id?: string;
      phone?: string;
      gender?: string;
      department_name?: string;
      note?: string;
    }>();

    if (Array.isArray(students_data)) {
      students_data.forEach((s: any) => {
        if (s && s.mssv) {
          studentDataMap.set(String(s.mssv).trim().toUpperCase(), s);
        }
      });
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

    // Optionally update `users` table if Excel contained new names/classes
    const userUpserts = cleanedMssvs
      .map((mssv) => {
        const sData = studentDataMap.get(mssv);
        if (!sData?.full_name && !sData?.class_id) return null;
        return {
          mssv,
          email: `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
          full_name: sData.full_name || mssv,
          class_id: sData.class_id || 'PTIT-HCM',
          phone: sData.phone || '',
          gender: sData.gender || 'Nam',
          role: 'student',
          tier: 'student',
          status: 'active',
        };
      })
      .filter(Boolean);

    if (userUpserts.length > 0) {
      try {
        await supabase.from('users').upsert(userUpserts as any, { onConflict: 'mssv' });
      } catch {}
    }

    // Auto-create departments in event meta if Excel specified custom department names
    const meta = await getEventMeta(supabase, resolvedParams.id);
    const currentDepts = meta.departments || [];
    const newDeptNames = Array.from(
      new Set(
        cleanedMssvs
          .map((m) => studentDataMap.get(m)?.department_name)
          .filter(
            (d): d is string =>
              Boolean(d && d.trim() && d.trim() !== 'Ban CTV' && !currentDepts.some((cd) => cd.name.toLowerCase() === d.trim().toLowerCase()))
          )
      )
    );

    if (newDeptNames.length > 0) {
      const updatedDepts = [...currentDepts];
      newDeptNames.forEach((dName, idx) => {
        updatedDepts.push({
          id: `dept_${Date.now()}_${idx}`,
          name: dName.trim(),
          slots: 50,
          gender_req: 'all',
          description: 'Tự động tạo từ danh sách nạp Excel',
        });
      });
      await saveEventMeta(supabase, resolvedParams.id, {
        departments: updatedDepts,
        is_recruitment_open: true,
      });
    }

    const now = new Date().toISOString();
    const actorEmail = auth.email;

    if (mode === 'checkin') {
      // Prepare records for `check_ins`
      const checkinRecords = cleanedMssvs.map((mssv) => {
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
        .upsert(checkinRecords as any, { onConflict: 'event_id,mssv' });

      if (insertErr) {
        console.error('Bulk checkin error:', insertErr);
        for (const record of checkinRecords) {
          try {
            await supabase.from('check_ins').insert(record as any);
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
        const sData = studentDataMap.get(mssv);
        const resolvedFullName = sData?.full_name || (uInfo?.full_name && !uInfo.full_name.includes('@') ? uInfo.full_name : null) || mssv;
        const resolvedClassId = sData?.class_id || uInfo?.class_id || 'PTIT-HCM';

        return {
          event_id: resolvedParams.id,
          mssv,
          email: uInfo?.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
          full_name: resolvedFullName,
          class_id: resolvedClassId,
          role_type: participate_role === 'volunteer' ? 'volunteer' : 'participant',
          attended: false,
          created_at: now,
        };
      });

      const { error: regErr } = await supabase
        .from('event_registrations')
        .upsert(regRecords as any, { onConflict: 'event_id,mssv' });

      if (regErr) {
        console.error('Bulk registration error:', regErr);
        const { error: insertErr } = await supabase
          .from('event_registrations')
          .insert(regRecords as any);
        if (insertErr) {
          console.error('Fallback insert error:', insertErr);
        }
      }

      // If imported as volunteer / CTV, link to department and set accepted status in registration extra store
      if (participate_role === 'volunteer') {
        const extrasMap: Record<string, any> = {};
        for (const mssv of cleanedMssvs) {
          const uInfo = userMap.get(mssv);
          const sData = studentDataMap.get(mssv);
          const resolvedDeptName = sData?.department_name || department_name || (department_id ? 'Ban Chuyên Trách' : 'Ban CTV');
          const resolvedPhone = sData?.phone || uInfo?.phone || '';
          const resolvedGender = sData?.gender || uInfo?.gender || 'Nam';

          extrasMap[mssv] = {
            department_id: department_id || null,
            department_name: resolvedDeptName,
            phone: resolvedPhone,
            gender: resolvedGender,
            review_status: 'accepted',
            note: sData?.note || 'Nạp danh sách trực tiếp bởi Ban Tổ Chức',
          };
        }
        await saveRegistrationExtrasBulk(supabase, resolvedParams.id, extrasMap);
      }

      return NextResponse.json({
        success: true,
        count: cleanedMssvs.length,
        message: participate_role === 'volunteer'
          ? `Đã nạp thành công ${cleanedMssvs.length} CTV vào danh sách CTV và tự động duyệt Trúng Tuyển!`
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
