import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isValidMSSV } from '@/lib/utils/extract-mssv';

/**
 * GET: Scan all event_registrations for invalid MSSV entries
 * DELETE: Remove invalid MSSV entries from a specific event
 */

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập' }, { status: 401 });
  }
  if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền truy cập' }, { status: 403 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  // Fetch all registrations
  const { data: regs, error } = await supabase
    .from('event_registrations')
    .select('id, event_id, mssv, full_name, class_id, role_type, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi truy vấn database' }, { status: 500 });
  }

  // Filter invalid MSSVs
  const invalidRegs = (regs || []).filter((r: any) => !isValidMSSV(r.mssv || ''));

  // Group by event
  const byEvent: Record<string, { event_id: string; entries: typeof invalidRegs }> = {};
  invalidRegs.forEach((r: any) => {
    if (!byEvent[r.event_id]) {
      byEvent[r.event_id] = { event_id: r.event_id, entries: [] };
    }
    byEvent[r.event_id].entries.push(r);
  });

  return NextResponse.json({
    success: true,
    data: {
      totalInvalid: invalidRegs.length,
      totalRegistrations: (regs || []).length,
      byEvent: Object.values(byEvent),
      invalidEntries: invalidRegs.slice(0, 200), // Limit to 200 for display
    },
  });
}

export async function DELETE(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập' }, { status: 401 });
  }
  if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền truy cập' }, { status: 403 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const body = await req.json().catch(() => ({}));
  const { event_id, mssv_list } = body;

  if (!event_id) {
    return NextResponse.json({
      success: false,
      error: 'Bắt buộc phải cung cấp event_id để tránh xóa nhầm dữ liệu xuyên sự kiện',
    }, { status: 400 });
  }

  let deletedCount = 0;

  if (mssv_list && Array.isArray(mssv_list) && mssv_list.length > 0) {
    // Only delete MSSVs that are actually INVALID — prevent accidental deletion of valid entries
    const invalidTargets = mssv_list
      .map((m: any) => String(m).trim().toUpperCase())
      .filter((m: string) => !isValidMSSV(m));

    if (invalidTargets.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Tất cả MSSV trong danh sách đều hợp lệ — không có gì để xóa',
      }, { status: 400 });
    }

    const { error } = await supabase
      .from('event_registrations')
      .delete()
      .in('mssv', invalidTargets)
      .eq('event_id', event_id);

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi xóa dữ liệu' }, { status: 500 });
    }
    deletedCount = invalidTargets.length;
  } else if (event_id) {
    // Delete all invalid MSSVs from a specific event
    const { data: regs } = await supabase
      .from('event_registrations')
      .select('id, mssv')
      .eq('event_id', event_id);

    const invalidIds = (regs || [])
      .filter((r: any) => !isValidMSSV(r.mssv || ''))
      .map((r: any) => r.id);

    if (invalidIds.length > 0) {
      const { error } = await supabase
        .from('event_registrations')
        .delete()
        .in('id', invalidIds);

      if (error) {
        return NextResponse.json({ success: false, error: 'Lỗi xóa dữ liệu' }, { status: 500 });
      }
      deletedCount = invalidIds.length;
    }
  }

  return NextResponse.json({
    success: true,
    deleted: deletedCount,
    message: `Đã xóa ${deletedCount} đăng ký có MSSV không hợp lệ.`,
  });
}
