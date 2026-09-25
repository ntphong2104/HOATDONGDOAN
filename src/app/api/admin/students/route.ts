import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isValidMSSV } from '@/lib/utils/extract-mssv';

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createClient();
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
      // Direct server-side search across all records
      const { data: searchResults, error } = await supabase
        .from('users')
        .select('*')
        .or(`mssv.ilike.%${query}%,full_name.ilike.%${query}%,email.ilike.%${query}%,class_id.ilike.%${query}%`)
        .order('mssv', { ascending: true })
        .limit(200);

      if (error) {
        return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
      }

      const filtered = (searchResults || []).filter((u) => !isUnitAccount(u));
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

    const studentsOnly = allUsers.filter((u) => !isUnitAccount(u));
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

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('users')
      .upsert(finalRecords, { onConflict: 'mssv' })
      .select('mssv, full_name, class_id, email, gender, phone');

    if (error) {
      console.error('Lỗi khi nạp sinh viên:', error);
      return NextResponse.json(
        { success: false, error: 'Lỗi máy chủ khi lưu thông tin sinh viên: ' + error.message },
        { status: 500 }
      );
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

    const supabase = await createClient();
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
