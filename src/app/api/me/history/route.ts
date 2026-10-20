import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { enrichHistoryWithSessionCounts } from '@/lib/constants/event-meta-store';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());
  const email = auth.email;
  const fallbackMssv = extractMSSV(email) || email.split('@')[0].toUpperCase();

  try {
    const { data: user } = await supabase
      .from('users')
      .select('mssv')
      .or(`email.ilike.${email},mssv.ilike.${fallbackMssv}`)
      .maybeSingle();

    const targetMssv = (user?.mssv || fallbackMssv).trim().toUpperCase();

    const { data: history } = await supabase
      .from('check_ins')
      .select(`
        id,
        event_id,
        participate_role,
        created_at,
        events (event_id, event_name, event_date, semester)
      `)
      .ilike('mssv', targetMssv)
      .order('created_at', { ascending: false });

    const historyMap = new Map<string, any>();
    (history || []).forEach((item: any) => {
      const key = item.event_id || String(item.id);
      if (!historyMap.has(key)) {
        historyMap.set(key, {
          event_id: item.event_id || item.events?.event_id,
          event_name: item.events?.event_name || 'Không rõ',
          event_date: item.events?.event_date,
          semester: item.events?.semester || 'Không rõ',
          participate_role: item.participate_role,
          checkin_time: item.created_at,
        });
      }
    });

    const formattedHistory = await enrichHistoryWithSessionCounts(
      supabase,
      targetMssv,
      Array.from(historyMap.values())
    );

    return NextResponse.json({ success: true, data: formattedHistory });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: err.message }, { status: 500 });
  }
}
