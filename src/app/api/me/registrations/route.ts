import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { getRegistrationExtras, getEventMeta } from '@/lib/constants/event-meta-store';

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

    const { getSessionCheckIns, getEventMeta: getMetaForEvent } = await import('@/lib/constants/event-meta-store');

    const enrichedList = await Promise.all(
      (regs || []).map(async (r: any) => {
        const ev = r.events || {};
        const regExtras = await getRegistrationExtras(supabase, r.event_id);
        const extra = regExtras[(r.mssv || '').toUpperCase()] || {};
        const singleMeta = await getMetaForEvent(supabase, r.event_id);
        const sessionCheckins = await getSessionCheckIns(supabase, r.event_id);
        const mySessions = sessionCheckins.filter((s) => s.mssv.toUpperCase() === (r.mssv || '').toUpperCase());
        const totalSessions = (singleMeta.sessions && singleMeta.sessions.length > 0) ? singleMeta.sessions.length : 1;

        // Also check the check_ins table for this student (for legacy checkins before multi-session fix)
        let mySessionCount = mySessions.length;
        const mySessionNames: string[] = mySessions.map((s) => s.session_name || s.session_id);

        if (totalSessions > 1) {
          // Multi-session event: cross-reference with check_ins table to find missed sessions
          try {
            const { data: checkInRecords } = await supabase
              .from('check_ins')
              .select('checked_by, created_at')
              .eq('event_id', r.event_id)
              .eq('mssv', (r.mssv || '').toUpperCase());

            if (checkInRecords && checkInRecords.length > 0) {
              for (const ci of checkInRecords) {
                const ciTime = new Date(ci.created_at);
                // Supabase stores in UTC, convert to Vietnam time (UTC+7)
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
            }
          } catch {}
        }

        // Fallback: if attended but still 0 sessions counted
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
      })
    );

    return NextResponse.json({
      success: true,
      data: enrichedList,
    });
  } catch (err: any) {
    console.error('api/me/registrations error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
