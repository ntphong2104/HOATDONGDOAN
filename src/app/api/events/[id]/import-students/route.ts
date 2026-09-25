import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, saveEventMeta, saveRegistrationExtrasBulk } from '@/lib/constants/event-meta-store';
import { isValidMSSV } from '@/lib/utils/extract-mssv';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';

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
  const isYouthUnion = auth.tier === 'youth_union';
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

  // Khóa nạp danh sách khi sự kiện đã kết thúc quá 3 ngày (trừ Super Admin)
  if (isEventLockedPast3Days(event) && !isSuperAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền nạp danh sách.',
      },
      { status: 403 }
    );
  }

  const isEventCreator = event.created_by && auth.email && event.created_by.toLowerCase() === auth.email.toLowerCase();

  // Check event-specific role assignment
  let hasEventRole = false;
  if (!isSuperAdmin && !isYouthUnion && !isEventAdmin && !isEventCreator) {
    try {
      const { data: eventRole } = await supabase
        .from('event_roles')
        .select('role_type')
        .eq('email', auth.email)
        .eq('event_id', resolvedParams.id)
        .maybeSingle();
      hasEventRole = !!eventRole;
    } catch {}
  }

  // Allow Super Admin, Youth Union, Event Admin, Event Creator, and anyone with an event role
  if (!isSuperAdmin && !isYouthUnion && !isEventAdmin && !isEventCreator && !hasEventRole) {
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
      role_type?: 'participant' | 'volunteer' | 'organizer';
      note?: string;
    }>();

    if (Array.isArray(students_data)) {
      students_data.forEach((s: any) => {
        if (s && s.mssv) {
          studentDataMap.set(String(s.mssv).trim().toUpperCase(), s);
        }
      });
    }

    // Count raw occurrences of each MSSV in input to detect duplicates within the file/input
    const rawMssvCounts = new Map<string, number>();
    (mssv_list || []).forEach((m: any) => {
      const raw = String(m || '').trim().toUpperCase();
      if (raw.length >= 4) {
        rawMssvCounts.set(raw, (rawMssvCounts.get(raw) || 0) + 1);
      }
    });

    // Clean, uppercase, deduplicate, and VALIDATE MSSV format
    const allMssvs = Array.from(rawMssvCounts.keys());
    const cleanedMssvs = allMssvs.filter((m) => isValidMSSV(m));
    const rejectedMssvs = allMssvs.filter((m) => !isValidMSSV(m));
    const rejectedMssvCount = rejectedMssvs.length;

    if (cleanedMssvs.length === 0) {
      return NextResponse.json({
        success: false,
        error: rejectedMssvCount > 0
          ? `Không tìm thấy MSSV hợp lệ. ${rejectedMssvCount} mã bị từ chối do sai format (MSSV chuẩn PTIT: N22DCCN001, D22CQCN01-N, ...)`
          : 'Không tìm thấy MSSV hợp lệ trong danh sách cung cấp',
      }, { status: 400 });
    }

    const meta = await getEventMeta(supabase, resolvedParams.id);
    const maxParticipants = Number((event as any).max_participants || meta.max_participants || 0);
    const targetMode = body.target_mode || (mode === 'validate' ? 'checkin' : mode);

    // ── VALIDATE MODE: Comprehensive Preview + cross-checks before import ──
    if (mode === 'validate') {
      const BATCH_SIZE = 100;
      const allUsers: any[] = [];
      for (let i = 0; i < cleanedMssvs.length; i += BATCH_SIZE) {
        const batch = cleanedMssvs.slice(i, i + BATCH_SIZE);
        const { data: batchUsers } = await supabase
          .from('users')
          .select('mssv, full_name, class_id, email, phone, gender')
          .in('mssv', batch);
        if (batchUsers) allUsers.push(...batchUsers);
      }

      const existingUserMap = new Map<string, any>();
      allUsers.forEach((u: any) => existingUserMap.set(u.mssv.toUpperCase(), u));

      // 1. Fetch check_ins for this event
      const { data: eventCheckins } = await supabase
        .from('check_ins')
        .select('mssv, participate_role, checked_by, created_at')
        .eq('event_id', resolvedParams.id);

      const checkinMap = new Map<string, any>();
      (eventCheckins || []).forEach((c: any) => {
        checkinMap.set(String(c.mssv).trim().toUpperCase(), c);
      });

      // 2. Fetch event_registrations for this event
      const { data: eventRegs } = await supabase
        .from('event_registrations')
        .select('mssv, full_name, class_id, role_type, attended, attended_at')
        .eq('event_id', resolvedParams.id);

      const regMap = new Map<string, any>();
      (eventRegs || []).forEach((r: any) => {
        regMap.set(String(r.mssv).trim().toUpperCase(), r);
      });

      const previewStudents = cleanedMssvs.map((mssv) => {
        const dbUser = existingUserMap.get(mssv);
        const excelData = studentDataMap.get(mssv);
        const checkinRecord = checkinMap.get(mssv);
        const regRecord = regMap.get(mssv);
        const duplicateCount = rawMssvCounts.get(mssv) || 1;

        const warnings: string[] = [];
        const badges: Array<{ type: 'danger' | 'warning' | 'info' | 'success'; text: string }> = [];

        const finalName = excelData?.full_name || regRecord?.full_name || dbUser?.full_name || '';
        const finalClass = excelData?.class_id || regRecord?.class_id || dbUser?.class_id || '';

        // Check 1: In-file duplicates
        const isDuplicateInFile = duplicateCount > 1;
        if (isDuplicateInFile) {
          warnings.push(`Trùng lặp trong danh sách nạp (${duplicateCount} lần)`);
          badges.push({ type: 'danger', text: `Trùng ${duplicateCount}x` });
        }

        // Check 2: Already checked in
        const isAlreadyCheckedIn = Boolean(checkinRecord);
        if (isAlreadyCheckedIn) {
          if (targetMode === 'checkin') {
            const timeStr = checkinRecord.created_at
              ? new Date(checkinRecord.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
              : '';
            warnings.push(`Đã điểm danh trước đó${timeStr ? ` (lúc ${timeStr})` : ''}`);
            badges.push({ type: 'warning', text: 'Đã điểm danh rồi' });
          } else {
            badges.push({ type: 'info', text: 'Đã điểm danh' });
          }
        }

        // Check 3: Registered status
        const isRegistered = Boolean(regRecord);
        if (targetMode === 'checkin') {
          if (isRegistered) {
            badges.push({ type: 'success', text: 'Đã đăng ký trước' });
          } else {
            warnings.push('Chưa đăng ký sự kiện trước (Khách vãng lai)');
            badges.push({ type: 'info', text: 'Chưa đăng ký (Vãng lai)' });
          }
        } else if (targetMode === 'register') {
          if (isRegistered) {
            warnings.push('Đã có trong danh sách đăng ký sự kiện');
            badges.push({ type: 'warning', text: 'Đã đăng ký rồi' });
          } else {
            badges.push({ type: 'success', text: 'Chưa đăng ký' });
          }
        }

        // Check 4: System User Account
        const inSystem = Boolean(dbUser);
        if (!inSystem) {
          warnings.push('Chưa có trong danh bạ sinh viên (Sẽ tự tạo tài khoản)');
          badges.push({ type: 'info', text: 'Chưa có tài khoản' });
        } else {
          badges.push({ type: 'success', text: 'Đã có tài khoản' });
        }

        // Check 5: Name & Class completeness
        if (!finalName || finalName === mssv || finalName.includes('@')) {
          warnings.push('Thiếu họ tên');
        }
        if (!finalClass || finalClass === 'PTIT-HCM') {
          warnings.push('Thiếu lớp');
        }

        return {
          mssv,
          full_name: finalName || mssv,
          class_id: finalClass || 'PTIT-HCM',
          phone: excelData?.phone || dbUser?.phone || '',
          gender: excelData?.gender || dbUser?.gender || '',
          department_name: excelData?.department_name || '',
          role_type: excelData?.role_type || participate_role,
          in_system: inSystem,
          from_excel: Boolean(excelData?.full_name),
          is_already_checked_in: isAlreadyCheckedIn,
          checked_in_at: checkinRecord?.created_at || null,
          checked_by: checkinRecord?.checked_by || null,
          is_registered: isRegistered,
          registered_role: regRecord?.role_type || null,
          is_duplicate_in_file: isDuplicateInFile,
          duplicate_count: duplicateCount,
          warnings,
          badges,
        };
      });

      const studentsWithWarnings = previewStudents.filter((s) => s.warnings.length > 0);
      const currentCount = targetMode === 'checkin' ? (eventCheckins?.length || 0) : (eventRegs?.length || 0);
      const newAddCount = targetMode === 'checkin'
        ? previewStudents.filter((s) => !s.is_already_checked_in).length
        : previewStudents.filter((s) => !s.is_registered).length;
      const projectedTotal = currentCount + newAddCount;
      const isOverflow = maxParticipants > 0 && projectedTotal > maxParticipants;
      const overflowCount = isOverflow ? projectedTotal - maxParticipants : 0;
      const remainingSlots = maxParticipants > 0 ? Math.max(0, maxParticipants - currentCount) : null;

      return NextResponse.json({
        success: true,
        mode: 'validate',
        target_mode: targetMode,
        total: cleanedMssvs.length,
        rejected: rejectedMssvCount,
        rejected_mssvs: rejectedMssvs.slice(0, 30),
        warnings_count: studentsWithWarnings.length,
        summary: {
          total_valid: cleanedMssvs.length,
          rejected: rejectedMssvCount,
          in_file_duplicates: previewStudents.filter((s) => s.is_duplicate_in_file).length,
          already_checked_in: previewStudents.filter((s) => s.is_already_checked_in).length,
          already_registered: previewStudents.filter((s) => s.is_registered).length,
          not_registered: previewStudents.filter((s) => !s.is_registered).length,
          not_in_system: previewStudents.filter((s) => !s.in_system).length,
          ready_to_import: newAddCount,
          capacity: {
            max_participants: maxParticipants,
            current_count: currentCount,
            new_add_count: newAddCount,
            projected_total: projectedTotal,
            is_overflow: isOverflow,
            overflow_count: overflowCount,
            remaining_slots: remainingSlots,
          },
        },
        students: previewStudents,
      });
    }

    const BATCH_SIZE = 100;
    
    const allUsers: any[] = [];
    for (let i = 0; i < cleanedMssvs.length; i += BATCH_SIZE) {
      const batch = cleanedMssvs.slice(i, i + BATCH_SIZE);
      const { data: batchUsers } = await supabase
        .from('users')
        .select('mssv, full_name, class_id, email, phone, gender')
        .in('mssv', batch);
      if (batchUsers) allUsers.push(...batchUsers);
    }

    const userMap = new Map<string, { full_name: string; class_id: string; email?: string; phone?: string; gender?: string }>();
    allUsers.forEach((u: any) => {
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
          target_count: 50,
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
        const sData = studentDataMap.get(mssv);
        const resolvedRole = sData?.role_type || (participate_role === 'volunteer' ? 'volunteer' : participate_role === 'organizer' ? 'organizer' : 'participant');
        return {
          event_id: resolvedParams.id,
          mssv,
          participate_role: resolvedRole,
          checked_by: `Nạp bởi ${actorEmail}`,
          created_at: now,
        };
      });

      // Upsert into check_ins in batches to avoid timeout
      for (let i = 0; i < checkinRecords.length; i += BATCH_SIZE) {
        const batch = checkinRecords.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase
          .from('check_ins')
          .upsert(batch as any, { onConflict: 'event_id,mssv' });

        if (insertErr) {
          console.error('Batch checkin error:', insertErr);
          // Fallback: insert one by one for this batch
          for (const record of batch) {
            try {
              await supabase.from('check_ins').insert(record as any);
            } catch {}
          }
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

      // Also save department info + importer for CTV in checkin mode
      const checkinVolunteers = cleanedMssvs.filter((mssv) => {
        const sData = studentDataMap.get(mssv);
        const r = sData?.role_type || participate_role;
        return r === 'volunteer';
      });

      if (checkinVolunteers.length > 0) {
        const extrasMap: Record<string, any> = {};
        for (const mssv of checkinVolunteers) {
          const uInfo = userMap.get(mssv);
          const sData = studentDataMap.get(mssv);
          const resolvedDeptName = sData?.department_name || department_name || (department_id ? 'Ban Chuyên Trách' : 'Ban CTV');
          extrasMap[mssv] = {
            department_id: department_id || null,
            department_name: resolvedDeptName,
            phone: sData?.phone || uInfo?.phone || '',
            gender: sData?.gender || uInfo?.gender || 'Nam',
            review_status: 'accepted',
            note: sData?.note || `Nạp điểm danh bởi ${actorEmail} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            imported_by: actorEmail,
            imported_at: now,
          };
        }
        await saveRegistrationExtrasBulk(supabase, resolvedParams.id, extrasMap);
      }

      return NextResponse.json({
        success: true,
        count: cleanedMssvs.length,
        rejected: rejectedMssvCount,
        message: `Đã nạp và điểm danh thành công ${cleanedMssvs.length} sinh viên vào sự kiện "${event.event_name}".${rejectedMssvCount > 0 ? ` (${rejectedMssvCount} MSSV sai format đã bị bỏ qua)` : ''}`,
      });
    } else {
      // Mode: Pre-register into `event_registrations`
      const regRecords = cleanedMssvs.map((mssv) => {
        const uInfo = userMap.get(mssv);
        const sData = studentDataMap.get(mssv);
        const resolvedFullName = sData?.full_name || (uInfo?.full_name && !uInfo.full_name.includes('@') ? uInfo.full_name : null) || mssv;
        const resolvedClassId = sData?.class_id || uInfo?.class_id || 'PTIT-HCM';
        const resolvedRole = sData?.role_type || (participate_role === 'volunteer' ? 'volunteer' : participate_role === 'organizer' ? 'organizer' : 'participant');

        return {
          event_id: resolvedParams.id,
          mssv,
          email: uInfo?.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
          full_name: resolvedFullName,
          class_id: resolvedClassId,
          role_type: resolvedRole,
          attended: false,
          created_at: now,
        };
      });

      // Upsert registrations in batches to avoid timeout
      for (let i = 0; i < regRecords.length; i += BATCH_SIZE) {
        const batch = regRecords.slice(i, i + BATCH_SIZE);
        const { error: regErr } = await supabase
          .from('event_registrations')
          .upsert(batch as any, { onConflict: 'event_id,mssv' });

        if (regErr) {
          console.error('Batch registration error:', regErr);
          try {
            await supabase.from('event_registrations').insert(batch as any);
          } catch {}
        }
      }

      // If any imported students are volunteers / CTV, link to department and set accepted status in registration extra store
      const volunteerMssvs = cleanedMssvs.filter((mssv) => {
        const sData = studentDataMap.get(mssv);
        const r = sData?.role_type || participate_role;
        return r === 'volunteer';
      });

      if (volunteerMssvs.length > 0) {
        const extrasMap: Record<string, any> = {};
        for (const mssv of volunteerMssvs) {
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
            note: sData?.note || `Nạp DS bởi ${actorEmail} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            imported_by: actorEmail,
            imported_at: now,
          };
        }
        await saveRegistrationExtrasBulk(supabase, resolvedParams.id, extrasMap);
      }

      // Also save importer info for non-volunteer registrations
      const nonVolunteerMssvs = cleanedMssvs.filter((mssv) => !volunteerMssvs.includes(mssv));
      if (nonVolunteerMssvs.length > 0) {
        const extrasMap: Record<string, any> = {};
        for (const mssv of nonVolunteerMssvs) {
          extrasMap[mssv] = {
            review_status: 'accepted',
            note: `Nạp DS bởi ${actorEmail} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            imported_by: actorEmail,
            imported_at: now,
          };
        }
        await saveRegistrationExtrasBulk(supabase, resolvedParams.id, extrasMap);
      }

      const rejectedNote = rejectedMssvCount > 0 ? ` (${rejectedMssvCount} MSSV sai format đã bị bỏ qua)` : '';
      return NextResponse.json({
        success: true,
        count: cleanedMssvs.length,
        rejected: rejectedMssvCount,
        message: participate_role === 'volunteer' || volunteerMssvs.length > 0
          ? `Đã nạp thành công ${cleanedMssvs.length} sinh viên (gồm ${volunteerMssvs.length} CTV và ${cleanedMssvs.length - volunteerMssvs.length} người tham gia)!${rejectedNote}`
          : `Đã nạp thành công ${cleanedMssvs.length} sinh viên vào danh sách đăng ký sự kiện "${event.event_name}".${rejectedNote}`,
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
