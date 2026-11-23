import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import {
  getAcademicSemesters,
  saveAcademicSemesters,
  DEFAULT_ACADEMIC_SEMESTERS,
} from '@/lib/utils/semesters';
import type { AcademicSemester } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());
    const semesters = await getAcademicSemesters(supabase);
    return NextResponse.json({ success: true, data: semesters });
  } catch (err: any) {
    console.error('GET /api/admin/semesters error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tải danh sách học kỳ', data: DEFAULT_ACADEMIC_SEMESTERS },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || !auth.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin mới có quyền cấu hình và gán thời gian học kỳ.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const semesters: AcademicSemester[] = Array.isArray(body?.semesters)
      ? body.semesters
      : body
      ? [body]
      : [];

    if (semesters.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Danh sách học kỳ không hợp lệ.' },
        { status: 400 }
      );
    }

    // Validate each semester
    for (const s of semesters) {
      if (!s.id || !s.name || !s.start_date || !s.end_date) {
        return NextResponse.json(
          {
            success: false,
            error: `Học kỳ "${s.name || s.id}" thiếu thông tin mã, tên hoặc ngày bắt đầu/kết thúc.`,
          },
          { status: 400 }
        );
      }
      if (s.start_date > s.end_date) {
        return NextResponse.json(
          {
            success: false,
            error: `Học kỳ "${s.name}": Ngày bắt đầu (${s.start_date}) không được lớn hơn ngày kết thúc (${s.end_date}).`,
          },
          { status: 400 }
        );
      }
    }

    // Ensure exactly one active semester if any is marked active, or set the first as active
    let activeFound = false;
    for (const s of semesters) {
      if (s.is_active) {
        if (activeFound) {
          s.is_active = false;
        } else {
          activeFound = true;
        }
      }
    }
    if (!activeFound && semesters.length > 0) {
      semesters[0].is_active = true;
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const ok = await saveAcademicSemesters(supabase, semesters, auth.email);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Lỗi khi lưu cấu hình học kỳ vào cơ sở dữ liệu.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cập nhật cấu hình và gán thời gian học kỳ thành công.',
      data: semesters,
    });
  } catch (err: any) {
    console.error('POST /api/admin/semesters error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi máy chủ khi cập nhật học kỳ.' },
      { status: 500 }
    );
  }
}
