import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizePostgrestValue } from '@/lib/security/sanitizer';
import { isValidMSSV } from '@/lib/utils/extract-mssv';
import { getMasterStudentByMssv, isPlaceholderName, isPlaceholderClass } from '@/lib/utils/student-profile';
import { getGraduatedCohortsConfig, isStudentInDeletedCohort } from '@/lib/utils/graduated-cohorts';
import {
  getAllUserProfilesMap,
  saveUserProfileExtraWithSync,
  type UserProfileExtra,
} from '@/lib/constants/user-profile-store';

function normalizeStudentRow(u: any, profilesMap?: Map<string, UserProfileExtra>) {
  const mssv = String(u.mssv || '').trim().toUpperCase();
  const email = String(u.email || '').trim().toLowerCase();
  const master = mssv ? getMasterStudentByMssv(mssv) : null;
  const rawName = String(u.full_name || '').trim();
  const rawClass = String(u.class_id || '').trim();

  const resolvedName =
    rawName && !isPlaceholderName(rawName, mssv)
      ? rawName
      : master?.full_name || '';

  const resolvedClass =
    rawClass && !isPlaceholderClass(rawClass)
      ? rawClass
      : master?.class_id || '';

  const extra =
    (mssv ? profilesMap?.get(mssv) : undefined) ||
    (email ? profilesMap?.get(email) : undefined);

  return {
    ...u,
    full_name: resolvedName,
    class_id: resolvedClass,
    phone: String(u.phone || extra?.phone || '').trim(),
    gender: String(u.gender || extra?.gender || '').trim(),
  };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
    const [{ deleted_cohorts }, profilesMap] = await Promise.all([
      getGraduatedCohortsConfig(supabase),
      getAllUserProfilesMap(supabase),
    ]);
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim();

    const isUnitAccount = (u: { mssv?: string; email?: string }) => {
      const m = (u.mssv || '').toUpperCase();
      const e = (u.email || '').toLowerCase();
      return (
        m.startsWith('LCD_') ||
        m.startsWith('CLB_') ||
        m.startsWith('DOI_') ||
        m.startsWith('PHONG_') ||
        m.startsWith('DOAN_') ||
        m.startsWith('SUPER_') ||
        e.startsWith('lcd') ||
        e.startsWith('clb') ||
        e.startsWith('doi') ||
        e.includes('ctsv') ||
        e.includes('quantri') ||
        e.includes('superadmin')
      );
    };

    if (query) {
      const safeQuery = sanitizePostgrestValue(query);
      if (!safeQuery) {
        return NextResponse.json({ success: true, data: [] });
      }
      // Direct server-side search across all records
      const { data: searchResults, error } = await supabase
        .from('users')
        .select('*')
        .or(`mssv.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,class_id.ilike.%${safeQuery}%`)
        .order('mssv', { ascending: true })
        .limit(200);

      if (error) {
        return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
      }

      const combinedResults = Array.isArray(searchResults) ? [...searchResults] : [];
      const seenMssvs = new Set(
        combinedResults.map((u) => String(u.mssv || '').trim().toUpperCase()).filter(Boolean)
      );

      // Reverse lookup by phone digits inside profilesMap
      const queryDigits = query.replace(/\D/g, '');
      if (queryDigits.length >= 3 && profilesMap.size > 0) {
        const matchedMssvs = new Set<string>();
        for (const [key, entry] of profilesMap.entries()) {
          if (!entry?.phone) continue;
          const phoneDigits = String(entry.phone).replace(/\D/g, '');
          if (!phoneDigits || !phoneDigits.includes(queryDigits)) continue;
          const rawMssv = key.includes('@') ? key.split('@')[0].trim().toUpperCase() : key.trim().toUpperCase();
          if (isValidMSSV(rawMssv) && !seenMssvs.has(rawMssv)) {
            matchedMssvs.add(rawMssv);
          }
        }
        if (matchedMssvs.size > 0) {
          try {
            const { data: phoneUsers } = await supabase
              .from('users')
              .select('*')
              .in('mssv', Array.from(matchedMssvs).slice(0, 100));
            if (Array.isArray(phoneUsers)) {
              for (const pu of phoneUsers) {
                const pm = String(pu.mssv || '').trim().toUpperCase();
                if (pm && !seenMssvs.has(pm)) {
                  seenMssvs.add(pm);
                  combinedResults.push(pu);
                }
              }
            }
          } catch {}
        }
      }

      const filtered = combinedResults
        .filter((u) => !isUnitAccount(u) && !isStudentInDeletedCohort(u.mssv, u.class_id, deleted_cohorts))
        .map((u) => normalizeStudentRow(u, profilesMap));
      return NextResponse.json({ success: true, data: filtered });
    }

    // When fetching full list: fetch all records using pagination ranges (1000 per page to bypass PostgREST limit)
    let allUsers: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore && page < 20) {
      const start = page * pageSize;
      const end = start + pageSize - 1;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('mssv', { ascending: true })
        .range(start, end);

      if (error) {
        console.error('Error fetching page', page, error);
        break;
      }

      if (data && data.length > 0) {
        allUsers = allUsers.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    const studentsOnly = allUsers
      .filter((u) => !isUnitAccount(u) && !isStudentInDeletedCohort(u.mssv, u.class_id, deleted_cohorts))
      .map((u) => normalizeStudentRow(u, profilesMap));
    return NextResponse.json({ success: true, data: studentsOnly });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin mới có quyền thêm sinh viên' },
        { status: 403 }
      );
    }

    const rateLimit = checkRateLimit(`add_student_${auth.email}`, 30, 60000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Thao tác quá nhanh, vui lòng thử lại sau ${rateLimit.resetInSeconds} giây` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const rawList: any[] = Array.isArray(body.students)
      ? body.students
      : Array.isArray(body)
      ? body
      : [body];

    if (rawList.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp thông tin sinh viên cần thêm' },
        { status: 400 }
      );
    }

    const validRecords: Array<{
      mssv: string;
      full_name: string;
      class_id: string;
      email: string;
      gender?: string;
      phone?: string;
    }> = [];
    const errors: string[] = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const mssv = String(item.mssv || '').trim().toUpperCase();
      const fullName = String(item.full_name || '').trim();
      const classId = String(item.class_id || '').trim().toUpperCase();
      let email = String(item.email || '').trim().toLowerCase();
      const gender = item.gender ? String(item.gender).trim() : undefined;
      const phone = item.phone ? String(item.phone).trim() : undefined;

      // Skip completely empty rows
      if (!mssv && !fullName && !classId) {
        continue;
      }

      if (!mssv) {
        errors.push(`Dòng ${i + 1}: MSSV không được để trống.`);
        continue;
      }
      if (!isValidMSSV(mssv)) {
        errors.push(`Dòng ${i + 1}: MSSV "${mssv}" không đúng định dạng chuẩn PTIT.`);
        continue;
      }
      if (!fullName) {
        errors.push(`Dòng ${i + 1} (${mssv}): Họ và tên không được để trống.`);
        continue;
      }
      if (!classId) {
        errors.push(`Dòng ${i + 1} (${mssv}): Mã lớp không được để trống.`);
        continue;
      }

      if (!email) {
        email = `${mssv.toLowerCase()}@student.ptithcm.edu.vn`;
      } else if (email.endsWith('@')) {
        email = `${email}student.ptithcm.edu.vn`;
      } else if (!email.includes('@')) {
        email = `${email}@student.ptithcm.edu.vn`;
      }

      validRecords.push({
        mssv,
        full_name: fullName,
        class_id: classId,
        email,
        ...(gender ? { gender } : {}),
        ...(phone ? { phone } : {}),
      });
    }

    if (validRecords.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors.length > 0 ? errors.join('; ') : 'Không có dòng dữ liệu hợp lệ nào được tìm thấy.',
          errors,
        },
        { status: 400 }
      );
    }

    // Deduplicate by MSSV in current batch
    const uniqueMap = new Map<string, typeof validRecords[0]>();
    for (const rec of validRecords) {
      uniqueMap.set(rec.mssv, rec);
    }
    const finalRecords = Array.from(uniqueMap.values());
    const dbRecords = finalRecords.map(({ mssv, full_name, class_id, email }) => ({
      mssv,
      full_name,
      class_id,
      email,
    }));

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
    const { data, error } = await supabase
      .from('users')
      .upsert(dbRecords, { onConflict: 'mssv' })
      .select('mssv, full_name, class_id, email');

    if (error) {
      console.error('Lỗi khi nạp sinh viên:', error);
      return NextResponse.json(
        { success: false, error: 'Lỗi máy chủ khi lưu thông tin sinh viên: ' + error.message },
        { status: 500 }
      );
    }

    for (const rec of finalRecords) {
      if (rec.phone || rec.gender) {
        try {
          await saveUserProfileExtraWithSync(supabase, rec.email, rec.mssv, {
            ...(rec.phone ? { phone: rec.phone } : {}),
            ...(rec.gender ? { gender: rec.gender } : {}),
          });
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã lưu thành công ${finalRecords.length} sinh viên vào hệ thống!`,
      count: finalRecords.length,
      data,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('API /api/admin/students POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi máy chủ, vui lòng thử lại sau.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin mới có quyền xóa sinh viên' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    let mssv = searchParams.get('mssv')?.trim().toUpperCase();

    if (!mssv) {
      try {
        const body = await req.json();
        mssv = body.mssv ? String(body.mssv).trim().toUpperCase() : undefined;
      } catch {}
    }

    if (!mssv) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp MSSV cần xóa' },
        { status: 400 }
      );
    }

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('mssv', mssv);

    if (error) {
      // Foreign key constraint: checkin or registration exists
      if (error.code === '23503') {
        return NextResponse.json(
          {
            success: false,
            error: `Không thể xóa sinh viên ${mssv} vì đã có dữ liệu tham gia/điểm danh sự kiện trong hệ thống.`,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Lỗi xóa sinh viên: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Đã xóa sinh viên ${mssv} khỏi hệ thống thành công!`,
    });
  } catch (err: any) {
    console.error('API /api/admin/students DELETE error:', err);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi hệ thống' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/students
 * Cập nhật thông tin SV (full_name, class_id, phone, gender)
 */
export async function PATCH(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || !auth.isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền sửa thông tin SV' }, { status: 403 });
    }

    const { mssv, full_name, class_id, phone, gender } = await req.json();
    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Thiếu MSSV' }, { status: 400 });
    }
    const cleanMssv = String(mssv).trim().toUpperCase();

    if (phone !== undefined) {
      const trimmedPhone = String(phone).trim();
      const digits = trimmedPhone.replace(/\D/g, '');
      if (trimmedPhone && (digits.length < 8 || digits.length > 15)) {
        return NextResponse.json(
          { success: false, error: 'Số điện thoại không hợp lệ (cần 8–15 chữ số)' },
          { status: 400 }
        );
      }
    }

    const updatePayload: Record<string, any> = {};
    if (full_name !== undefined) updatePayload.full_name = String(full_name).trim();
    if (class_id !== undefined) updatePayload.class_id = String(class_id).trim().toUpperCase();

    const hasProfileExtra = phone !== undefined || gender !== undefined;
    if (Object.keys(updatePayload).length === 0 && !hasProfileExtra) {
      return NextResponse.json({ success: false, error: 'Không có thông tin cần cập nhật' }, { status: 400 });
    }

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

    let userData: any = null;
    if (Object.keys(updatePayload).length > 0) {
      const { data, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('mssv', cleanMssv)
        .select()
        .maybeSingle();

      if (error) {
        console.error('Update student error:', error);
        return NextResponse.json({ success: false, error: 'Lỗi cập nhật: ' + error.message }, { status: 500 });
      }
      userData = data;
    } else {
      const { data } = await supabase
        .from('users')
        .select('mssv, email, full_name, class_id')
        .eq('mssv', cleanMssv)
        .maybeSingle();
      userData = data;
    }

    let syncedExtra: UserProfileExtra | null = null;
    if (hasProfileExtra) {
      const targetEmail =
        userData?.email || `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`;
      syncedExtra = await saveUserProfileExtraWithSync(supabase, targetEmail, cleanMssv, {
        ...(phone !== undefined ? { phone: String(phone).trim() } : {}),
        ...(gender !== undefined && String(gender).trim() ? { gender: String(gender).trim() } : {}),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...(userData || { mssv: cleanMssv }),
        ...(phone !== undefined ? { phone: String(phone).trim() } : syncedExtra?.phone ? { phone: syncedExtra.phone } : {}),
        ...(gender !== undefined ? { gender: String(gender).trim() } : syncedExtra?.gender ? { gender: syncedExtra.gender } : {}),
      },
    });
  } catch (err: any) {
    console.error('API /api/admin/students PATCH error:', err);
    return NextResponse.json({ success: false, error: 'Đã xảy ra lỗi hệ thống' }, { status: 500 });
  }
}
