import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import {
  MAX_MISSED_STRIKES,
  pardonEventInNotes,
} from '@/lib/utils/blacklist-logic';

/**
 * POST /api/admin/blacklist/pardon-event
 * 
 * Gỡ vi phạm hàng loạt theo sự kiện:
 * - Tìm tất cả SV bị đánh vắng mặt ở sự kiện X
 * - Giảm missed_count -1 cho từng SV
 * - Nếu missed_count < 3 → tự động mở khóa Blacklist
 * - Đánh dấu attended = true cho registrations của sự kiện đó
 * 
 * Body: { event_id: string, reason: string }
 */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json(
      { success: false, error: 'Chỉ Super Admin mới có quyền thực hiện thao tác này' },
      { status: 403 }
    );
  }

  try {
    const { event_id, reason } = await req.json();

    if (!event_id) {
      return NextResponse.json({ success: false, error: 'Thiếu event_id' }, { status: 400 });
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng nhập lý do nghiệp vụ để lưu vết xử lý' },
        { status: 400 }
      );
    }

    const supabase =
      (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) ||
      (await createClient());

    // 1. Lấy thông tin sự kiện
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('event_id, event_name')
      .eq('event_id', event_id)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy sự kiện' },
        { status: 404 }
      );
    }

    // 2. Tìm tất cả SV đăng ký mà chưa điểm danh (attended = false) ở sự kiện này
    const { data: absentRegs, error: regErr } = await supabase
      .from('event_registrations')
      .select('mssv, email, full_name, class_id')
      .eq('event_id', event_id)
      .eq('attended', false);

    if (regErr) {
      return NextResponse.json(
        { success: false, error: 'Lỗi truy vấn đăng ký sự kiện' },
        { status: 500 }
      );
    }

    if (!absentRegs || absentRegs.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Không có sinh viên nào bị đánh vắng mặt ở sự kiện "${event.event_name}"`,
        data: { processed: 0, unblacklisted: 0 },
      });
    }

    const absentMssvs = absentRegs.map((r) => r.mssv).filter(Boolean);

    // 3. Lấy hồ sơ vi phạm của các SV này
    const { data: penalties, error: penErr } = await supabase
      .from('user_penalties')
      .select('*')
      .in('mssv', absentMssvs);

    if (penErr) {
      return NextResponse.json(
        { success: false, error: 'Lỗi truy vấn hồ sơ vi phạm' },
        { status: 500 }
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

    // 4. Cập nhật từng SV có hồ sơ vi phạm
    let processed = 0;
    let unblacklisted = 0;
    const errors: string[] = [];

    // Process in batches of 20
    const penaltyMap = new Map((penalties || []).map((p) => [p.mssv, p]));

    for (const mssv of absentMssvs) {
      const existing = penaltyMap.get(mssv);
      if (!existing) continue; // Không có hồ sơ vi phạm → bỏ qua

      const currentMissed = existing.missed_count || 1;
      const newMissed = Math.max(0, currentMissed - 1);
      const wasBlacklisted = existing.is_blacklisted;
      const isBlacklisted = newMissed >= MAX_MISSED_STRIKES;

      const updatedNotes = pardonEventInNotes({
        notesStr: existing.notes,
        targetEventId: event_id,
        targetIndex: undefined,
        reason: `[Gỡ hàng loạt theo sự kiện "${event.event_name}"] ${cleanReason}`,
        adminEmail: auth.email,
        nowFormatted,
      });

      const updatePayload: Record<string, any> = {
        missed_count: newMissed,
        is_blacklisted: isBlacklisted,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      };

      if (!isBlacklisted && wasBlacklisted) {
        updatePayload.unbanned_at = new Date().toISOString();
        updatePayload.unbanned_by = auth.email;
        unblacklisted++;
      }

      const { error: updateErr } = await supabase
        .from('user_penalties')
        .update(updatePayload)
        .eq('mssv', mssv);

      if (updateErr) {
        errors.push(`${mssv}: ${updateErr.message}`);
      } else {
        processed++;
      }
    }

    // Note: Không set attended = true ở đây!
    // attended chỉ phản ánh việc quét mã QR thật sự, không liên quan đến gỡ vi phạm.

    return NextResponse.json({
      success: true,
      message: `Đã gỡ vi phạm cho ${processed}/${absentMssvs.length} sinh viên ở sự kiện "${event.event_name}".`
        + (unblacklisted > 0 ? ` ${unblacklisted} sinh viên được mở khóa Blacklist!` : '')
        + (errors.length > 0 ? ` (${errors.length} lỗi)` : ''),
      data: {
        event_name: event.event_name,
        total_absent: absentMssvs.length,
        processed,
        unblacklisted,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err: any) {
    console.error('Pardon-event route exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý yêu cầu' },
      { status: 500 }
    );
  }
}
