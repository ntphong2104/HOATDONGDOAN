import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import {
  MAX_MISSED_STRIKES,
  pardonEventInNotes,
  pardonAllInNotes,
} from '@/lib/utils/blacklist-logic';

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json(
      { success: false, error: 'Chỉ Super Admin mới có quyền gỡ đánh dấu vắng mặt và xử lý Danh Sách Đen' },
      { status: 403 }
    );
  }

  try {
    const { mssv, event_id, event_index, reason, action = 'single_event' } = await req.json();

    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Thiếu mã số sinh viên (MSSV)' }, { status: 400 });
    }

    const cleanMssv = mssv.trim().toUpperCase();
    const cleanReason = (reason || '').trim();

    if (!cleanReason) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng nhập lý do / ghi chú nghiệp vụ để lưu vết xử lý' },
        { status: 400 }
      );
    }

    const supabase =
      (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) ||
      (await createClient());

    // 1. Fetch current penalty row
    const { data: existing, error: fetchErr } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', cleanMssv)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ success: false, error: 'Lỗi truy vấn cơ sở dữ liệu' }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy hồ sơ vi phạm của sinh viên ${cleanMssv}` },
        { status: 404 }
      );
    }

    const nowFormatted = new Date().toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    let newMissed = 0;
    let isBlacklisted = false;
    let updatedNotes = '';

    if (action === 'single_event') {
      const currentMissed = existing.missed_count || 1;
      newMissed = Math.max(0, currentMissed - 1);
      isBlacklisted = newMissed >= MAX_MISSED_STRIKES;

      updatedNotes = pardonEventInNotes({
        notesStr: existing.notes,
        targetEventId: event_id,
        targetIndex: event_index,
        reason: cleanReason,
        adminEmail: auth.email,
        nowFormatted,
      });

      // Update registration record so it shows attended
      if (event_id) {
        await supabase
          .from('event_registrations')
          .update({ attended: true })
          .eq('event_id', event_id)
          .eq('mssv', cleanMssv);
      }
    } else {
      // action === 'unban_all'
      newMissed = 0;
      isBlacklisted = false;

      updatedNotes = pardonAllInNotes({
        notesStr: existing.notes,
        reason: cleanReason,
        adminEmail: auth.email,
        nowFormatted,
      });

      // Mark all past unattended registrations as attended
      await supabase
        .from('event_registrations')
        .update({ attended: true })
        .eq('mssv', cleanMssv)
        .eq('attended', false);
    }

    // 2. Persist updated penalty status
    const updatePayload: any = {
      missed_count: newMissed,
      is_blacklisted: isBlacklisted,
      notes: updatedNotes,
      updated_at: new Date().toISOString(),
    };

    if (!isBlacklisted && existing.is_blacklisted) {
      updatePayload.unbanned_at = new Date().toISOString();
      updatePayload.unbanned_by = auth.email;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('user_penalties')
      .update(updatePayload)
      .eq('mssv', cleanMssv)
      .select()
      .single();

    if (updateErr) {
      console.error('Error updating penalty:', updateErr);
      return NextResponse.json({ success: false, error: 'Lỗi cập nhật hồ sơ kỷ luật' }, { status: 500 });
    }

    const unbanMessage =
      !isBlacklisted && existing.is_blacklisted
        ? ' Sinh viên đã được mở khóa Blacklist và có thể đăng ký sự kiện bình thường!'
        : '';

    return NextResponse.json({
      success: true,
      data: updated,
      message:
        action === 'single_event'
          ? `Đã xóa đánh dấu vắng mặt cho sinh viên ${cleanMssv}. Số lần vắng hiện tại: ${newMissed}/3.${unbanMessage}`
          : `Đã mở khóa và xóa sạch vi phạm cho sinh viên ${cleanMssv} thành công!`,
    });
  } catch (err: any) {
    console.error('Pardon route exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý yêu cầu' },
      { status: 500 }
    );
  }
}
