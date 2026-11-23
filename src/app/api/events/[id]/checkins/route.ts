import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, canScanEvent } from '@/lib/supabase/auth-helper';
import { getSessionCheckIns, getEventMeta } from '@/lib/constants/event-meta-store';
import { isValidMSSV } from '@/lib/utils/extract-mssv';
import { resolveStudentProfiles, isPlaceholderName, isPlaceholderClass } from '@/lib/utils/student-profile';
import { fetchAllRows } from '@/lib/supabase/pagination';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  const isPrivileged = isSuperAdmin || auth.tier === 'youth_union';

  // Only sync existing Super Admins to the lookup table — NOT youth_union users
  if (isSuperAdmin) {
    try {
      await supabase.from('super_admins').upsert({ email: auth.email.toLowerCase() }, { onConflict: 'email' });
    } catch {}
  }

  if (!isPrivileged) {
    const allowed = await canScanEvent(auth, resolvedParams.id, undefined, supabase);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  // Also query attended registrations so attended students are consistently included
  const [
    { data: checkins, error },
    { data: attendedRegistrations },
    sessionCheckins,
    meta
  ] = await Promise.all([
    fetchAllRows<any>(() =>
      supabase
        .from('check_ins')
        .select(`
          mssv,
          participate_role,
          checked_by,
          created_at,
          users (full_name, class_id)
        `)
        .eq('event_id', resolvedParams.id)
        .order('created_at', { ascending: false })
    ),
    fetchAllRows<any>(() =>
      supabase
        .from('event_registrations')
        .select('mssv, full_name, class_id, role_type, created_at')
        .eq('event_id', resolvedParams.id)
        .eq('attended', true)
    ),
    getSessionCheckIns(supabase, resolvedParams.id),
    getEventMeta(supabase, resolvedParams.id)
  ]);

  if (error) {
    console.error('Fetch checkins error:', error);
  }

  const checkinsMap = new Map<string, any>();

  (checkins || []).forEach((c: any) => {
    const cleanKey = String(c.mssv || '').trim().toUpperCase();
    if (!cleanKey) return;
    if (!checkinsMap.has(cleanKey)) {
      checkinsMap.set(cleanKey, {
        mssv: cleanKey,
        full_name: c.users?.full_name || cleanKey,
        class_id: c.users?.class_id || '',
        participate_role:
          c.participate_role === 'volunteer'
            ? 'Cộng tác viên'
            : c.participate_role === 'organizer'
            ? 'Ban tổ chức'
            : 'Người tham gia',
        checked_by: c.checked_by || 'Mã QR Động (Tự quét)',
        checkin_time: c.created_at,
      });
    }
  });

  (attendedRegistrations || []).forEach((r: any) => {
    const cleanKey = String(r.mssv || '').trim().toUpperCase();
    if (!cleanKey) return;
    if (!checkinsMap.has(cleanKey)) {
      checkinsMap.set(cleanKey, {
        mssv: cleanKey,
        full_name: r.full_name || cleanKey,
        class_id: r.class_id || '',
        participate_role: r.role_type === 'volunteer' ? 'Cộng tác viên' : 'Người tham gia',
        checked_by: 'Mã QR Động (Tự quét)',
        checkin_time: r.created_at || new Date().toISOString(),
      });
    }
  });

  // Resolve real student name & class (ignores placeholder MSSV / 'PTIT-HCM' profiles
  // created by MSSV-only imports and falls back to names entered in any registration)
  const allMssvs = [...checkinsMap.keys()];
  if (allMssvs.length > 0) {
    const profiles = await resolveStudentProfiles(supabase, allMssvs);

    checkinsMap.forEach((val, key) => {
      const p = profiles.get(key.toUpperCase());
      if (p?.full_name) {
        val.full_name = p.full_name;
      } else if (isPlaceholderName(val.full_name, key)) {
        val.full_name = ''; // unknown real name -> UI shows '—' instead of repeating MSSV
      }
      if (p?.class_id) {
        val.class_id = p.class_id;
      } else if (isPlaceholderClass(val.class_id)) {
        val.class_id = '';
      }
    });
  }

  // Pre-index per-session check-in history by uppercase MSSV (O(N+M) instead of O(N*M))
  const totalSessions = (meta.sessions && meta.sessions.length > 0) ? meta.sessions.length : 1;
  const sessionsByMssv = new Map<string, typeof sessionCheckins>();
  for (const s of sessionCheckins) {
    const k = String(s.mssv || '').trim().toUpperCase();
    if (!k) continue;
    const list = sessionsByMssv.get(k);
    if (list) list.push(s);
    else sessionsByMssv.set(k, [s]);
  }

  const exportData = Array.from(checkinsMap.values()).map((c, index) => {
    const mySessions = sessionsByMssv.get(c.mssv) || [];
    const sessionNames = mySessions.length > 0
      ? mySessions.map((s) => s.session_name || s.session_id)
      : ['Buổi chính'];
    const sessionCount = mySessions.length > 0 ? mySessions.length : 1;

    return {
      stt: index + 1,
      ...c,
      session_count: sessionCount,
      total_sessions: totalSessions,
      session_ratio: `${sessionCount}/${totalSessions} buổi`,
      session_names: sessionNames.join(', '),
      sessions: mySessions,
    };
  });

  // Filter out invalid MSSV entries (corrupted data from bad imports)
  const cleanExportData = exportData
    .filter((c: any) => isValidMSSV(c.mssv || ''))
    .map((c: any, index: number) => ({ ...c, stt: index + 1 })); // Re-number STT after filtering

  const cleanSessionCheckins = sessionCheckins.filter((s: any) => isValidMSSV(s.mssv || ''));

  return NextResponse.json({
    success: true,
    data: cleanExportData,
    count: cleanExportData.length,
    session_checkins: cleanSessionCheckins,
  });
}
