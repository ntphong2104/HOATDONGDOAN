import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import {
  canCreateBorrowRequest,
  isOfficeAdminAuth,
  resolveBorrowerUnit,
} from '@/lib/utils/office-auth';
import {
  computeBorrowLateDays,
  getOfficeDutyConfig,
} from '@/lib/utils/office-duty';
import { getStoredOfficerRoles } from '@/lib/constants/officers-store';
import { notifyUsersByEmail } from '@/lib/utils/web-push';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const isAdmin = isOfficeAdminAuth(auth);
    if (!isAdmin && !canCreateBorrowRequest(auth)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ tài khoản đơn vị (LCĐ / CLB / Đội) hoặc Admin VPĐ mới truy cập được.' },
        { status: 403 }
      );
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const unit = resolveBorrowerUnit(auth);

    let reqQuery = supabase
      .from('office_borrow_requests')
      .select('*, office_borrow_items(*)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!isAdmin) {
      reqQuery = reqQuery.ilike('requester_email', auth.email);
    }

    const [{ data: requests, error }, { data: bans }] = await Promise.all([
      reqQuery,
      supabase
        .from('office_borrow_bans')
        .select('*')
        .eq('is_active', true)
        .gt('banned_until', new Date().toISOString())
        .order('banned_at', { ascending: false }),
    ]);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const myActiveBan = (bans || []).find(
      (b: any) => String(b.unit_code || '').toUpperCase() === unit.unit_code.toUpperCase()
    ) || null;

    // Tự động tính số ngày quá hạn hiện tại cho các đơn đang mượn nhưng chưa trả
    const now = new Date();
    const enriched = (requests || []).map((r: any) => {
      const currentOverdueDays =
        r.status === 'borrowed' ? computeBorrowLateDays(r.due_date, now) : r.late_days || 0;
      return {
        ...r,
        items: r.office_borrow_items || [],
        current_overdue_days: currentOverdueDays,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        requests: enriched,
        unit,
        my_active_ban: myActiveBan,
        is_admin: isAdmin,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi tải danh sách đơn mượn' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!canCreateBorrowRequest(auth)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ tài khoản đơn vị (LCĐ / CLB / Đội) mới được tạo đơn mượn dụng cụ.' },
        { status: 403 }
      );
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const unit = resolveBorrowerUnit(auth!);
    const body = await req.json();

    // 1. Kiểm tra đơn vị có đang bị CẤM MƯỢN không
    const { data: activeBan } = await supabase
      .from('office_borrow_bans')
      .select('*')
      .eq('unit_code', unit.unit_code)
      .eq('is_active', true)
      .gt('banned_until', new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (activeBan && !isOfficeAdminAuth(auth)) {
      const untilStr = new Date(activeBan.banned_until).toLocaleDateString('vi-VN');
      return NextResponse.json(
        {
          success: false,
          error: `Đơn vị "${unit.unit_name}" hiện đang bị CẤM MƯỢN dụng cụ đến ngày ${untilStr} (Lý do: ${activeBan.reason}). Vui lòng liên hệ Văn phòng Đoàn.`,
        },
        { status: 403 }
      );
    }

    const purpose = String(body?.purpose || '').trim();
    const borrow_date = String(body?.borrow_date || '').trim();
    const due_date = String(body?.due_date || '').trim();
    const requester_name = String(body?.requester_name || unit.unit_name).trim();
    const requester_phone = String(body?.requester_phone || '').trim();
    const items: Array<{ item_id?: string; item_name: string; quantity: number }> = Array.isArray(body?.items)
      ? body.items
      : [];

    if (!purpose || !borrow_date || !due_date) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng điền mục đích, ngày mượn và ngày hẹn trả.' },
        { status: 400 }
      );
    }
    if (borrow_date > due_date) {
      return NextResponse.json(
        { success: false, error: 'Ngày hẹn trả phải lớn hơn hoặc bằng ngày mượn.' },
        { status: 400 }
      );
    }
    const validItems = items
      .map((it) => ({
        item_id: it.item_id || null,
        item_name: String(it.item_name || '').trim(),
        quantity: Math.max(1, Number(it.quantity) || 1),
      }))
      .filter((it) => it.item_name);

    if (validItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng chọn ít nhất 1 vật phẩm cần mượn.' },
        { status: 400 }
      );
    }

    // 2. Tạo đơn mượn
    const { data: created, error: createErr } = await supabase
      .from('office_borrow_requests')
      .insert({
        unit_code: unit.unit_code,
        unit_name: unit.unit_name,
        requester_email: auth!.email.toLowerCase(),
        requester_name,
        requester_phone,
        purpose,
        borrow_date,
        due_date,
        status: 'pending',
      })
      .select('*')
      .single();

    if (createErr || !created) {
      return NextResponse.json(
        { success: false, error: createErr?.message || 'Không thể tạo đơn mượn.' },
        { status: 500 }
      );
    }

    const itemRows = validItems.map((it) => ({
      request_id: created.id,
      item_id: it.item_id,
      item_name: it.item_name,
      quantity: it.quantity,
    }));

    const { error: itemErr } = await supabase.from('office_borrow_items').insert(itemRows);
    if (itemErr) {
      // Rollback orphan borrow request if inserting items fails
      await supabase.from('office_borrow_requests').delete().eq('id', created.id);
      return NextResponse.json({ success: false, error: itemErr.message }, { status: 500 });
    }

    const pendingCache = (globalThis as unknown as { __hddAdminPendingCounts?: { expiresAt: number } })
      .__hddAdminPendingCounts;
    if (pendingCache) pendingCache.expiresAt = 0;

    // Notify Office Admins & Super Admins about new borrow request (non-blocking)
    void (async () => {
      try {
        const [roles, { data: supers }] = await Promise.all([
          getStoredOfficerRoles(supabase),
          supabase.from('super_admins').select('email'),
        ]);
        const adminEmails = [
          ...(roles || [])
            .filter((r: any) => {
              const t = r.role_tier || r.tier;
              return t === 'office_admin' || t === 'super_admin';
            })
            .map((r: any) => r.email),
          ...(supers || []).map((s: any) => s.email),
          'n22dccn158@student.ptithcm.edu.vn',
        ];
        const itemsPreview = validItems
          .slice(0, 3)
          .map((it) => `${it.item_name} (x${it.quantity})`)
          .join(', ');
        await notifyUsersByEmail(supabase, adminEmails, {
          title: '📦 Đơn mượn dụng cụ VPĐ mới',
          body: `${unit.unit_name} gửi đơn mượn ${itemsPreview}${validItems.length > 3 ? ` và ${validItems.length - 3} món khác` : ''} cho "${purpose}".`,
          url: '/office/admin',
          tag: `office-borrow-new-${created.id}`,
        });
      } catch {}
    })();

    return NextResponse.json({
      success: true,
      message: `Đã gửi đơn mượn dụng cụ cho ${unit.unit_name}. Vui lòng chờ Admin Văn phòng Đoàn phê duyệt.`,
      data: { ...created, items: itemRows },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi tạo đơn mượn dụng cụ' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Admin Văn phòng Đoàn hoặc Super Admin mới được duyệt / xác nhận trả.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const id = String(body?.id || '').trim();
    const action = String(body?.action || '').trim(); // 'approve' | 'handover' | 'return' | 'reject'
    const admin_note = String(body?.admin_note || '').trim();

    if (!id || !['approve', 'handover', 'return', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Thao tác không hợp lệ.' }, { status: 400 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const { data: existing } = await supabase
      .from('office_borrow_requests')
      .select('*, office_borrow_items(*)')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy đơn mượn.' }, { status: 404 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const reqItems = existing.office_borrow_items || [];

    const adjustInventory = async (deltaSign: -1 | 1) => {
      for (const it of reqItems) {
        if (!it.item_id) continue;
        const { data: inv } = await supabase
          .from('office_items')
          .select('available_qty, total_qty')
          .eq('id', it.item_id)
          .maybeSingle();
        if (!inv) continue;
        const nextAvail = Math.min(
          inv.total_qty,
          Math.max(0, (inv.available_qty || 0) + deltaSign * (it.quantity || 1))
        );
        await supabase
          .from('office_items')
          .update({ available_qty: nextAvail, updated_at: nowIso })
          .eq('id', it.item_id);
      }
    };

    if (action === 'approve') {
      const { error } = await supabase
        .from('office_borrow_requests')
        .update({
          status: 'approved',
          approved_by: auth!.email,
          approved_at: nowIso,
          admin_note: admin_note || existing.admin_note,
          updated_at: nowIso,
        })
        .eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      const pendingCache = (globalThis as unknown as { __hddAdminPendingCounts?: { expiresAt: number } })
        .__hddAdminPendingCounts;
      if (pendingCache) pendingCache.expiresAt = 0;
      void notifyUsersByEmail(supabase, [existing.requester_email], {
        title: '✅ Đơn mượn dụng cụ đã được duyệt',
        body: `Đơn mượn "${existing.purpose}" đã được Admin VPĐ phê duyệt. Vui lòng đến Văn phòng Đoàn nhận vật phẩm đúng lịch.`,
        url: '/office/borrow',
        tag: `office-borrow-${id}`,
      }).catch(() => {});
      return NextResponse.json({ success: true, message: 'Đã duyệt đơn mượn dụng cụ.' });
    }

    if (action === 'handover') {
      if (existing.status === 'borrowed' || existing.status === 'returned') {
        return NextResponse.json({ success: false, error: 'Đơn này đã được bàn giao hoặc đã hoàn tất.' }, { status: 400 });
      }
      await adjustInventory(-1);
      const { error } = await supabase
        .from('office_borrow_requests')
        .update({
          status: 'borrowed',
          approved_by: existing.approved_by || auth!.email,
          approved_at: existing.approved_at || nowIso,
          handed_over_at: nowIso,
          admin_note: admin_note || existing.admin_note,
          updated_at: nowIso,
        })
        .eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Đã xác nhận bàn giao vật phẩm cho đơn vị.' });
    }

    if (action === 'reject') {
      const { error } = await supabase
        .from('office_borrow_requests')
        .update({
          status: 'rejected',
          approved_by: auth!.email,
          approved_at: nowIso,
          admin_note: admin_note || 'Từ chối bởi Admin VPĐ',
          updated_at: nowIso,
        })
        .eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      const pendingCache = (globalThis as unknown as { __hddAdminPendingCounts?: { expiresAt: number } })
        .__hddAdminPendingCounts;
      if (pendingCache) pendingCache.expiresAt = 0;
      void notifyUsersByEmail(supabase, [existing.requester_email], {
        title: '❌ Đơn mượn dụng cụ bị từ chối',
        body: `Đơn mượn "${existing.purpose}" không được duyệt. Ghi chú: ${admin_note || 'Liên hệ Văn phòng Đoàn'}.`,
        url: '/office/borrow',
        tag: `office-borrow-${id}`,
      }).catch(() => {});
      return NextResponse.json({ success: true, message: 'Đã từ chối đơn mượn.' });
    }

    // action === 'return': Xác nhận đã trả trên web -> kiểm tra trễ >= 1 ngày -> TỰ ĐỘNG CẤM MƯỢN!
    if (existing.status === 'returned') {
      return NextResponse.json({ success: false, error: 'Đơn này đã được xác nhận trả trước đó.' }, { status: 400 });
    }
    if (existing.status === 'borrowed') {
      await adjustInventory(1);
    }

    const lateDays = computeBorrowLateDays(existing.due_date, now);
    const { error } = await supabase
      .from('office_borrow_requests')
      .update({
        status: 'returned',
        returned_at: nowIso,
        return_confirmed_by: auth!.email,
        late_days: lateDays,
        admin_note: admin_note || existing.admin_note,
        updated_at: nowIso,
      })
      .eq('id', id);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    let autoBanned = false;
    let appliedBanDays = 30;
    if (lateDays >= 1) {
      const config = await getOfficeDutyConfig(supabase);
      appliedBanDays = Math.max(1, Number(config.ban_days_on_late_return) || 30);
      const bannedUntil = new Date(now.getTime() + appliedBanDays * 86_400_000).toISOString();

      await supabase.from('office_borrow_bans').insert({
        unit_code: existing.unit_code,
        unit_name: existing.unit_name,
        request_id: existing.id,
        reason: `Trả dụng cụ trễ ${lateDays} ngày so với hạn ${existing.due_date} (Đơn: ${existing.purpose})`,
        banned_at: nowIso,
        banned_until: bannedUntil,
        is_active: true,
        created_by: auth!.email,
      });
      autoBanned = true;
    }

    return NextResponse.json({
      success: true,
      message: autoBanned
        ? `Đã xác nhận trả đồ. Do trễ ${lateDays} ngày, hệ thống đã TỰ ĐỘNG CẤM MƯỢN "${existing.unit_name}" trong ${appliedBanDays} ngày!`
        : 'Đã xác nhận đơn vị trả đầy đủ dụng cụ đúng hạn.',
      data: { late_days: lateDays, auto_banned: autoBanned, ban_days: autoBanned ? appliedBanDays : 0 },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý đơn mượn' },
      { status: 500 }
    );
  }
}
