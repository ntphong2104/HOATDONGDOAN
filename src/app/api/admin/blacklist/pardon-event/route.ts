import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import {
  MAX_MISSED_STRIKES,
  pardonEventInNotes,
  hasActiveManualBan,
  hasActiveStrikeForEvent,
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
      .select('event_id, event_name, event_date')
      .eq('event_id', event_id)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy thông tin sự kiện này' },
        { status: 404 }
      );
    }

    const eventIdentifier = `[${event_id}]`;
    const cleanEventName = (event.event_name || '').trim();
    const shortEventName = cleanEventName.slice(0, 30);

    // 2. Tìm nhanh các hồ sơ phạt trong `user_penalties` có liên quan đến sự kiện này
    // Cách 1: Ghi chú vi phạm có chứa [event_id] hoặc tên sự kiện
    const { data: penaltiesWithNotes } = await supabase
      .from('user_penalties')
      .select('*')
      .or(`notes.ilike.%${eventIdentifier}%,notes.ilike.%${shortEventName}%`)
      .limit(1000);

    // Cách 2: Tìm các SV đăng ký mà chưa điểm danh ở sự kiện này
    const { data: absentRegs } = await supabase
      .from('event_registrations')
      .select('mssv')
      .eq('event_id', event_id)
      .or('attended.eq.false,attended.is.null')
      .limit(1000);

    const absentMssvs = Array.from(
      new Set((absentRegs || []).map((r: any) => (r.mssv || '').toUpperCase().trim()).filter(Boolean))
    );

    // Gộp danh sách ứng viên
    const candidateMap = new Map<string, any>();
    if (penaltiesWithNotes) {
      for (const p of penaltiesWithNotes) {
        if (p.mssv) candidateMap.set(p.mssv.toUpperCase().trim(), p);
      }
    }

    // Nếu có SV vắng mặt chưa có trong candidateMap, truy vấn bổ sung theo chunk 100
    const missingMssvs = absentMssvs.filter((m) => !candidateMap.has(m));
    const CHUNK_SIZE = 100;
    for (let i = 0; i < missingMssvs.length; i += CHUNK_SIZE) {
      const chunk = missingMssvs.slice(i, i + CHUNK_SIZE);
      const { data: pRows } = await supabase
        .from('user_penalties')
        .select('*')
        .in('mssv', chunk);
      if (pRows) {
        for (const p of pRows) {
          if (p.mssv) candidateMap.set(p.mssv.toUpperCase().trim(), p);
        }
      }
    }

    if (candidateMap.size === 0) {
      return NextResponse.json({
        success: true,
        message: `Không tìm thấy sinh viên nào có ghi nhận vắng mặt cần gỡ ở sự kiện "${event.event_name}"`,
        data: { processed: 0, unblacklisted: 0 },
      });
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

    // 3. Tính toán dữ liệu cập nhật trong RAM (nhanh tức thì, không bị nghẽn I/O)
    const updatesToApply: any[] = [];
    let unblacklisted = 0;

    for (const existing of candidateMap.values()) {
      // SV chỉ được giảm vi phạm nếu họ THỰC SỰ có ghi nhận vi phạm chưa gỡ cho sự kiện này!
      // Tuyệt đối không giảm vi phạm cho SV bị khóa thủ công hoặc SV không bị phạt vì sự kiện này!
      if (!hasActiveStrikeForEvent(existing.notes, event_id, event.event_name)) {
        continue;
      }

      const updatedNotes = pardonEventInNotes({
        notesStr: existing.notes,
        targetEventId: event_id,
        targetEventName: event.event_name,
        targetIndex: undefined,
        reason: `[Gỡ hàng loạt theo sự kiện "${event.event_name}"] ${cleanReason}`,
        adminEmail: auth.email,
        nowFormatted,
      });

      // Nếu ghi chú không thay đổi (không tìm thấy lỗi tương ứng)
      if (updatedNotes === (existing.notes || '').trim()) {
        continue;
      }

      const currentMissed = typeof existing.missed_count === 'number' ? existing.missed_count : 1;
      const newMissed = Math.max(0, currentMissed - 1);
      const wasBlacklisted = Boolean(existing.is_blacklisted);
      const isManuallyBanned = hasActiveManualBan(updatedNotes);
      // Nếu có lệnh khóa thủ công còn hiệu lực, BẮT BUỘC giữ trạng thái is_blacklisted = true!
      const isBlacklisted = isManuallyBanned || (newMissed >= MAX_MISSED_STRIKES);

      const updatePayload: Record<string, any> = {
        mssv: existing.mssv,
        email: existing.email,
        full_name: existing.full_name,
        class_id: existing.class_id,
        missed_count: isManuallyBanned ? Math.max(newMissed, 3) : newMissed,
        is_blacklisted: isBlacklisted,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      };

      if (!isBlacklisted && wasBlacklisted) {
        updatePayload.unbanned_at = new Date().toISOString();
        updatePayload.unbanned_by = auth.email;
        unblacklisted++;
      }

      updatesToApply.push(updatePayload);
    }

    // Đánh dấu attended = true cho các đăng ký của sự kiện này trong event_registrations để không bị phạt lại khi chốt sổ
    try {
      await supabase
        .from('event_registrations')
        .update({ attended: true })
        .eq('event_id', event_id);
    } catch (regErr) {
      console.warn('Failed to mark attended in registrations for event:', regErr);
    }

    if (updatesToApply.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Đã cập nhật danh sách điểm danh cho sự kiện "${event.event_name}". Tất cả sinh viên đã được miễn vắng trước đó hoặc không có vi phạm cần gỡ trong danh sách kỷ luật.`,
        data: { processed: 0, unblacklisted: 0 },
      });
    }

    // 4. Batch upsert vào DB trong các chunk 50 (siêu nhanh, chỉ mất ~200ms)
    let processed = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 50;

    for (let i = 0; i < updatesToApply.length; i += BATCH_SIZE) {
      const chunk = updatesToApply.slice(i, i + BATCH_SIZE);
      const { error: batchErr } = await supabase
        .from('user_penalties')
        .upsert(chunk, { onConflict: 'mssv' });

      if (batchErr) {
        console.error('Batch upsert error, falling back to parallel chunk updates:', batchErr);
        // Fallback: chạy song song các update đơn lẻ cho chunk này
        await Promise.all(
          chunk.map(async (item) => {
            const { error: singleErr } = await supabase
              .from('user_penalties')
              .update(item)
              .eq('mssv', item.mssv);
            if (singleErr) errors.push(`${item.mssv}: ${singleErr.message}`);
            else processed++;
          })
        );
      } else {
        processed += chunk.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã gỡ vi phạm thành công cho ${processed} sinh viên ở sự kiện "${event.event_name}".`
        + (unblacklisted > 0 ? ` Có ${unblacklisted} sinh viên được mở khóa Blacklist!` : '')
        + (errors.length > 0 ? ` (${errors.length} lỗi)` : ''),
      data: {
        event_name: event.event_name,
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
