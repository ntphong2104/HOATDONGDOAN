import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { sanitizeSpreadsheetCell } from '@/lib/security/redirect';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'youth_union') {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const allCheckins: Record<string, unknown>[] = [];
    const pageSize = 1000;
    let offset = 0;
    while (offset < 50_000) {
      const { data, error } = await supabase
        .from('check_ins')
        .select('mssv, participate_role, checked_by, created_at, users(full_name, class_id), events(event_name, semester)')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error || !data || data.length === 0) break;
      allCheckins.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const rows = allCheckins.map((c: Record<string, unknown>, i: number) => ({
      stt: i + 1,
      mssv: sanitizeSpreadsheetCell(c.mssv),
      full_name: sanitizeSpreadsheetCell((c.users as Record<string, string>)?.full_name || ''),
      class_id: sanitizeSpreadsheetCell((c.users as Record<string, string>)?.class_id || ''),
      event_name: sanitizeSpreadsheetCell((c.events as Record<string, string>)?.event_name || ''),
      semester: sanitizeSpreadsheetCell((c.events as Record<string, string>)?.semester || ''),
      participate_role: sanitizeSpreadsheetCell(c.participate_role),
      checked_by: sanitizeSpreadsheetCell(c.checked_by),
      checkin_time: c.created_at,
    }));

    return NextResponse.json({ success: true, data: rows });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}
