import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth, getDutyVolunteerRecord } from '@/lib/utils/office-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const isAdmin = isOfficeAdminAuth(auth);
    if (!isAdmin) {
      const vol = await getDutyVolunteerRecord(supabase, auth.email);
      if (!vol) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('office_duty_windows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi tải đợt đăng ký' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Admin Văn phòng Đoàn hoặc Super Admin mới được mở đợt đăng ký.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const title = String(body?.title || '').trim();
    const apply_from = String(body?.apply_from || '').trim();
    const apply_to = String(body?.apply_to || '').trim();
    const open_at = String(body?.open_at || '').trim();
    const close_at = String(body?.close_at || '').trim();

    if (!title || !apply_from || !apply_to || !open_at || !close_at) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng điền đủ tên đợt, ngày áp dụng và thời gian mở/đóng đăng ký.' },
        { status: 400 }
      );
    }
    if (apply_from > apply_to) {
      return NextResponse.json(
        { success: false, error: 'Ngày áp dụng bắt đầu không được lớn hơn ngày kết thúc.' },
        { status: 400 }
      );
    }
    if (new Date(open_at).getTime() >= new Date(close_at).getTime()) {
      return NextResponse.json(
        { success: false, error: 'Thời điểm mở đăng ký phải trước thời điểm đóng đăng ký.' },
        { status: 400 }
      );
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const { data, error } = await supabase
      .from('office_duty_windows')
      .insert({
        title,
        apply_from,
        apply_to,
        open_at: new Date(open_at).toISOString(),
        close_at: new Date(close_at).toISOString(),
        is_active: true,
        created_by: auth!.email,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Đã mở đợt đăng ký "${title}".`,
      data,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi tạo đợt đăng ký' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu ID đợt đăng ký.' }, { status: 400 });

    const supabase = (await createAdminClient()) || (await createClient());
    const { data, error } = await supabase
      .from('office_duty_windows')
      .update({ is_active: Boolean(body?.is_active) })
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi cập nhật đợt' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu ID.' }, { status: 400 });

    const supabase = (await createAdminClient()) || (await createClient());
    const { error } = await supabase.from('office_duty_windows').delete().eq('id', id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Đã xóa đợt đăng ký.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi xóa đợt' }, { status: 500 });
  }
}
