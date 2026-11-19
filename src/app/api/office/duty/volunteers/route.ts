import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth } from '@/lib/utils/office-auth';
import { isValidMSSV } from '@/lib/utils/extract-mssv';
import { getMasterStudentByMssv } from '@/lib/utils/student-profile';
import { invalidateMeResponseCache } from '@/lib/constants/user-profile-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Admin Văn phòng Đoàn hoặc Super Admin mới có quyền xem danh sách CTV trực.' },
        { status: 403 }
      );
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const { data, error } = await supabase
      .from('office_duty_volunteers')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message.includes('does not exist')
            ? 'Bảng office_duty_volunteers chưa tồn tại — vui lòng chạy migration 013_office_duty.sql trên Supabase.'
            : error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi tải danh sách CTV trực' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Admin Văn phòng Đoàn hoặc Super Admin mới có quyền thêm CTV trực.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const rawList: string[] = Array.isArray(body?.mssvs)
      ? body.mssvs
      : body?.mssv
      ? [body.mssv]
      : [];

    const uniqueMssvs = Array.from(
      new Set(
        rawList
          .flatMap((s) => String(s || '').split(/[\s,;|\n\r\t]+/))
          .map((m) => m.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (uniqueMssvs.length === 0) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập ít nhất 1 MSSV.' }, { status: 400 });
    }
    if (uniqueMssvs.length > 200) {
      return NextResponse.json({ success: false, error: 'Tối đa 200 MSSV mỗi lần nạp.' }, { status: 400 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const { data: dbUsers } = await supabase
      .from('users')
      .select('mssv, email, full_name, class_id')
      .in('mssv', uniqueMssvs);

    const dbByMssv = new Map<string, any>();
    for (const u of dbUsers || []) {
      dbByMssv.set(String(u.mssv || '').trim().toUpperCase(), u);
    }

    const validRows: any[] = [];
    const invalid: string[] = [];

    for (const mssv of uniqueMssvs) {
      if (!isValidMSSV(mssv)) {
        invalid.push(mssv);
        continue;
      }
      const db = dbByMssv.get(mssv);
      const master = getMasterStudentByMssv(mssv);
      const email = (db?.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`).toLowerCase();
      validRows.push({
        mssv,
        email,
        full_name: master?.full_name || db?.full_name || mssv,
        class_id: master?.class_id || db?.class_id || 'PTIT-HCM',
        is_active: true,
        added_by: auth!.email,
      });
    }

    if (validRows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Không có MSSV hợp lệ nào (${invalid.join(', ')}).` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('office_duty_volunteers')
      .upsert(validRows, { onConflict: 'mssv' });

    if (error) {
      return NextResponse.json(
        { success: false, error: `Lỗi lưu danh sách CTV trực: ${error.message}` },
        { status: 500 }
      );
    }

    for (const r of validRows) {
      invalidateMeResponseCache(r.email);
    }

    return NextResponse.json({
      success: true,
      message: `Đã thêm ${validRows.length} CTV trực văn phòng${invalid.length > 0 ? ` (bỏ qua ${invalid.length} mã không hợp lệ)` : ''}.`,
      data: { added: validRows.length, invalid },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi thêm CTV trực' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mssv = String(searchParams.get('mssv') || '').trim().toUpperCase();
    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Thiếu MSSV cần xóa.' }, { status: 400 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const { data: existing } = await supabase
      .from('office_duty_volunteers')
      .select('email')
      .eq('mssv', mssv)
      .maybeSingle();

    const { error } = await supabase
      .from('office_duty_volunteers')
      .delete()
      .eq('mssv', mssv);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (existing?.email) invalidateMeResponseCache(existing.email);

    return NextResponse.json({ success: true, message: `Đã xóa ${mssv} khỏi danh sách CTV trực.` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi xóa CTV trực' }, { status: 500 });
  }
}
