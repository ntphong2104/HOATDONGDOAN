import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth, getDutyVolunteerRecord } from '@/lib/utils/office-auth';
import { getTodayVN } from '@/lib/utils/office-duty';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseVnDateTimeInput(raw: string): Date {
  const s = raw.trim();
  // <input type="datetime-local"> gửi "YYYY-MM-DDTHH:mm" không kèm offset -> cố định múi giờ VN (+07:00)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const withSec = s.length === 16 ? `${s}:00` : s;
    return new Date(`${withSec}+07:00`);
  }
  return new Date(s);
}

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
      return NextResponse.json({ success: false, error: 'Lỗi tải danh sách đợt đăng ký' }, { status: 500 });
    }

    const nowMs = Date.now();
    const todayVN = getTodayVN();
    const enriched = (data || []).map((w: any) => {
      const openMs = new Date(w.open_at).getTime();
      const closeMs = new Date(w.close_at).getTime();
      const applyTo = String(w.apply_to || '').slice(0, 10);
      let window_state: 'disabled' | 'ended' | 'closed' | 'upcoming' | 'open' = 'open';
      if (!w.is_active) {
        window_state = 'disabled';
      } else if (applyTo && todayVN > applyTo) {
        window_state = 'ended';
      } else if (Number.isFinite(closeMs) && nowMs > closeMs) {
        window_state = 'closed';
      } else if (Number.isFinite(openMs) && nowMs < openMs) {
        window_state = 'upcoming';
      }
      return { ...w, window_state };
    });

    return NextResponse.json({ success: true, data: enriched });
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
    const openDate = parseVnDateTimeInput(open_at);
    const closeDate = parseVnDateTimeInput(close_at);
    if (isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Định dạng thời gian mở/đóng đăng ký không hợp lệ.' },
        { status: 400 }
      );
    }
    if (openDate.getTime() >= closeDate.getTime()) {
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
        open_at: openDate.toISOString(),
        close_at: closeDate.toISOString(),
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
