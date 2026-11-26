import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { sanitizePostgrestValue } from '@/lib/security/sanitizer';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const adminSupabase = (await createAdminClient()) || supabase;
    const now = new Date().toISOString();

    // Verify active delegation
    const safeEmail = sanitizePostgrestValue(auth.email.toLowerCase().trim(), 120);
    const safeMssv = sanitizePostgrestValue(auth.email.split('@')[0].toUpperCase(), 40);
    const { data: delegate } = await adminSupabase
      .from('class_delegates')
      .select('*')
      .or(`email.eq.${safeEmail},mssv.eq.${safeMssv}`)
      .eq('is_active', true)
      .gt('expires_at', now)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!delegate) {
      return NextResponse.json(
        { success: false, error: 'Quyền tra cứu Ban cán sự lớp của bạn đã hết hạn hoặc chưa được cấp' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    let dbQuery = adminSupabase
      .from('users')
      .select('mssv, full_name, class_id, email')
      .eq('class_id', delegate.class_id)
      .order('mssv', { ascending: true });

    if (query) {
      const safeQuery = sanitizePostgrestValue(query);
      if (safeQuery) {
        dbQuery = dbQuery.or(`mssv.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`);
      }
    }

    const { data: classStudents, error } = await dbQuery.limit(500);

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    // Fetch check-in counts + event names for these students in this class
    const mssvList = (classStudents || []).map((s: any) => s.mssv);
    const attendedEventsByMssv: Record<string, Map<string, string>> = {};

    if (mssvList.length > 0) {
      const allCheckIns: any[] = [];
      for (const mChunk of chunkArray(mssvList, 100)) {
        const { data: chunkCheckIns } = await fetchAllRows<any>(() =>
          adminSupabase
            .from('check_ins')
            .select('mssv, event_id, events(event_name, event_date)')
            .in('mssv', mChunk)
            .order('created_at', { ascending: false })
        );
        if (chunkCheckIns) allCheckIns.push(...chunkCheckIns);
      }

      for (const ci of allCheckIns) {
        const m = String(ci.mssv || '').trim().toUpperCase();
        const evId = String(ci.event_id || '');
        if (!m || !evId) continue;
        if (!attendedEventsByMssv[m]) attendedEventsByMssv[m] = new Map();
        if (!attendedEventsByMssv[m].has(evId)) {
          const evObj = Array.isArray(ci.events) ? ci.events[0] : ci.events;
          const evName = String(evObj?.event_name || 'Sự kiện').trim();
          const rawDate = evObj?.event_date ? String(evObj.event_date).slice(0, 10) : '';
          const dateParts = rawDate.split('-');
          const dateVN = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';
          attendedEventsByMssv[m].set(evId, dateVN ? `${evName} (${dateVN})` : evName);
        }
      }
    }

    const results = (classStudents || []).map((s: any, idx: number) => {
      const m = String(s.mssv || '').trim().toUpperCase();
      const evMap = attendedEventsByMssv[m];
      const eventNames = evMap ? Array.from(evMap.values()) : [];
      return {
        stt: idx + 1,
        mssv: s.mssv,
        full_name: s.full_name,
        class_id: s.class_id,
        email: s.email,
        total_attended: eventNames.length,
        attended_events_summary: eventNames.map((n) => `• ${n}`).join('\n'),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        class_id: delegate.class_id,
        expires_at: delegate.expires_at,
        students: results,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
