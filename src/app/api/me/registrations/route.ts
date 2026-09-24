import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { getRegistrationExtras, getEventMeta, getSessionCheckIns } from '@/lib/constants/event-meta-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' }, { status: 401 });
    }

    const rawMssv = extractMSSV(auth.email) || auth.email.split('@')[0].toUpperCase();
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const { data: regs, error } = await supabase
      .from('event_registrations')
      .select(`
        id,
        event_id,
        mssv,
        role_type,
        attended,
        created_at,
        events (
          event_id,
          event_name,
          event_date,
          start_time,
          end_time,
          semester,
          status,
          is_active
        )
      `)
      .or(`email.ilike.${auth.email},mssv.ilike.${rawMssv}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch student registrations error:', error);
      return NextResponse.json({ success: false, error: 'Lỗi tải danh sách đăng ký' }, { status: 500 });
    }

    if (!regs || regs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Batch fetch: Get unique event_ids, then fetch ALL data in parallel (not per-registration)
    const uniqueEventIds = [...new Set(regs.map((r: any) => r.event_id))];

    const [allExtrasArr, allMetaArr, allSessionCheckinsArr, { data: allCheckIns }] = await Promise.all([
      // Batch fetch registration extras for all events
      Promise.all(uniqueEventIds.map(eid => getRegistrationExtras(supabase, eid).then(d => [eid, d] as const))),
      // Batch fetch event meta for all events
      Promise.all(uniqueEventIds.map(eid => getEventMeta(supabase, eid).then(d => [eid, d] as const))),
      // Batch fetch session checkins for all events
      Promise.all(uniqueEventIds.map(eid => getSessionCheckIns(supabase, eid).then(d => [eid, d] as const))),
      // Single query: get ALL check_ins for this student across all events
      supabase
        .from('check_ins')
        .select('event_id, checked_by, created_at')
        .in('event_id', uniqueEventIds)
        .ilike('mssv', rawMssv),
    ]);

    // Build lookup maps
    const extrasMap = new Map(allExtrasArr);
    const metaMap = new Map(allMetaArr);
    const sessionCheckinsMap = new Map(allSessionCheckinsArr);
    const checkInsMap = new Map<string, any[]>();
    for (const ci of (allCheckIns || [])) {
      const list = checkInsMap.get(ci.event_id) || [];
      list.push(ci);
      checkInsMap.set(ci.event_id, list);
    }

    // Now enrich each registration using the pre-fetched maps (NO more DB queries)
    const enrichedList = (regs as any[]).map((r) => {
      const ev = r.events || {};
      const regExtras = extrasMap.get(r.event_id) || {};
      const singleMeta = metaMap.get(r.event_id) || {} as any;
      const sessionCheckins = sessionCheckinsMap.get(r.event_id) || [];
      const checkInRecords = checkInsMap.get(r.event_id) || [];

      const extra = regExtras[(r.mssv || '').toUpperCase()] || {};
      const mySessions = sessionCheckins.filter((s: any) => s.mssv.toUpperCase() === (r.mssv || '').toUpperCase());
      const totalSessions = (singleMeta.sessions && singleMeta.sessions.length > 0) ? singleMeta.sessions.length : 1;

      let mySessionCount = mySessions.length;
      const mySessionNames: string[] = mySessions.map((s: any) => s.session_name || s.session_id);

      if (totalSessions > 1 && checkInRecords.length > 0) {
        try {
          for (const ci of checkInRecords) {
            const ciTime = new Date(ci.created_at);
            const vnTime = new Date(ciTime.getTime() + 7 * 60 * 60 * 1000);
            const ciHHMM = `${String(vnTime.getUTCHours()).padStart(2, '0')}:${String(vnTime.getUTCMinutes()).padStart(2, '0')}`;

            for (const sess of (singleMeta.sessions || [])) {
              const sStart = (sess.start_time || '00:00').substring(0, 5);
              const sEnd = (sess.end_time || '23:59').substring(0, 5);
              const endHour = parseInt(sEnd.split(':')[0], 10) + 1;
              const bufferedEnd = `${String(Math.min(endHour, 23)).padStart(2, '0')}:${sEnd.split(':')[1] || '00'}`;
              if (ciHHMM >= sStart && ciHHMM <= bufferedEnd) {
                if (!mySessionNames.includes(sess.name)) {
                  mySessionNames.push(sess.name);
                }
                break;
              }
            }
          }
          mySessionCount = Math.max(mySessionNames.length, mySessionCount, r.attended ? 1 : 0);
        } catch {}
      }

      if (mySessionCount === 0 && r.attended) {
        mySessionCount = 1;
      }

      return {
        id: r.id,
        event_id: r.event_id,
        event_name: ev.event_name || 'Sự kiện Học Viện',
        event_date: ev.event_date || null,
        start_time: ev.start_time || null,
        end_time: ev.end_time || null,
        semester: ev.semester || 'Học kỳ mới',
        status: ev.status || 'active',
        role_type: r.role_type || 'participant',
        department_name: extra.department_name || null,
        review_status: extra.review_status || (r.role_type === 'volunteer' ? 'pending' : 'accepted'),
        attended: Boolean(r.attended),
        registered_at: r.created_at,
        session_count: mySessionCount,
        total_sessions: totalSessions,
        session_ratio: totalSessions > 1 ? `${mySessionCount}/${totalSessions} ca` : null,
        session_names: mySessionNames,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedList,
    });
  } catch (err: any) {
    console.error('api/me/registrations error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
