import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getStoredOfficerRoles, ROOT_SUPER_ADMIN } from '@/lib/constants/officers-store';
import { parseDemoCookie } from '@/lib/supabase/auth-helper';
import { getUserProfileExtra, saveUserProfileExtra } from '@/lib/constants/user-profile-store';
import type { SessionUser, UserTier } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  try {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('demo_session');
    if (demoCookie?.value) {
      const demoUser = parseDemoCookie(demoCookie.value);
      if (demoUser && demoUser.email) {
        try {
          const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

          let assignedOfficerRole: any = null;
          try {
            const roles = await getStoredOfficerRoles(supabase);
            assignedOfficerRole = roles.find((r) => r.email.toLowerCase() === demoUser.email.toLowerCase());
          } catch {}

          let eventRoles: any = [];
          try {
            const res = await supabase
              .from('event_roles')
              .select(`
                event_id,
                role_type,
                events (event_name, status, is_active, event_date, start_time, end_time)
              `)
              .ilike('email', demoUser.email);
            if (res.data) eventRoles = res.data;
          } catch {}

          let createdEvents: any = [];
          try {
            const res = await supabase
              .from('events')
              .select('event_id, event_name, status, is_active, event_date, start_time, end_time')
              .ilike('created_by', demoUser.email);
            if (res.data) createdEvents = res.data;
          } catch {}

          const managed_events: any[] = [];
          const seenEventIds = new Set<string>();

          if (demoUser.managed_events && Array.isArray(demoUser.managed_events)) {
            for (const me of demoUser.managed_events) {
              if (me.event_id) {
                managed_events.push(me);
                seenEventIds.add(me.event_id);
              }
            }
          }

          for (const er of eventRoles) {
            if (er.event_id && !seenEventIds.has(er.event_id)) {
              managed_events.push({
                event_id: er.event_id,
                event_name: er.events?.event_name || 'Sự kiện',
                role_type: er.role_type,
              });
              seenEventIds.add(er.event_id);
            }
          }

          for (const ce of createdEvents) {
            if (ce.event_id && !seenEventIds.has(ce.event_id)) {
              managed_events.push({
                event_id: ce.event_id,
                event_name: ce.event_name,
                role_type: 'event_admin',
              });
              seenEventIds.add(ce.event_id);
            }
          }

          const tier: UserTier = assignedOfficerRole?.role_tier || demoUser.tier || 'user';
          const isSuperAdmin = tier === 'super_admin' || demoUser.isSuperAdmin || demoUser.email.toLowerCase() === 'n22dccn158@student.ptithcm.edu.vn';
          const isEventAdmin = isSuperAdmin || tier === 'youth_union' || tier === 'ctsv' || tier === 'facility' || tier === 'event_admin' || managed_events.length > 0;
          const isChecker = isEventAdmin || tier === 'checker' || demoUser.isChecker;

          const pExtra = getUserProfileExtra(demoUser.email) || (demoUser.mssv ? getUserProfileExtra(demoUser.mssv) : null);

          return NextResponse.json({
            success: true,
            data: {
              ...demoUser,
              gender: pExtra?.gender || demoUser.gender || 'Nam',
              phone: pExtra?.phone !== undefined ? pExtra.phone : (demoUser.phone || ''),
              tier,
              isSuperAdmin,
              isEventAdmin,
              isChecker,
              unit_name: assignedOfficerRole?.unit_name || demoUser.unit_name,
              unit_code: assignedOfficerRole?.unit_code || demoUser.unit_code,
              managed_events,
            },
          }, { headers: noCacheHeaders });
        } catch {
          return NextResponse.json({ success: true, data: demoUser }, { headers: noCacheHeaders });
        }
      }
    }
  } catch {
    // Non-request context fallback
  }

  const supabase = await createClient();
  const adminClient = (typeof createAdminClient === 'function' ? await createAdminClient() : supabase) || supabase;

  let email: string | null = null;
  let authMetadata: any = null;

  if (typeof supabase.auth.getUser === 'function') {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.email) {
      email = data.user.email;
      authMetadata = data.user.user_metadata;
    }
  }

  if (!email && typeof supabase.auth.getSession === 'function') {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user?.email) {
      email = data.session.user.email;
      authMetadata = data.session.user.user_metadata;
    }
  }

  if (!email) {
    return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' }, { status: 401 });
  }
  
  try {
    const username = email.split('@')[0].toUpperCase();
    const { data: user } = await adminClient
      .from('users')
      .select('mssv, full_name, class_id')
      .or(`email.ilike.${email},mssv.ilike.${username}`)
      .maybeSingle();

    let superAdmin = null;
    try {
      const q = adminClient.from('super_admins').select('email');
      const res = typeof q.ilike === 'function' ? await q.ilike('email', email).maybeSingle() : (typeof q.eq === 'function' ? await q.eq('email', email).single() : null);
      superAdmin = res?.data || null;
    } catch {
      try {
        const q = adminClient.from('super_admins').select('email');
        const res = typeof q.eq === 'function' ? await q.eq('email', email) : null;
        superAdmin = Array.isArray(res?.data) ? res.data[0] : res?.data;
      } catch {}
    }

    // Check dynamic officer_roles via persistent store
    let assignedOfficerRole: any = null;
    try {
      const roles = await getStoredOfficerRoles(adminClient);
      assignedOfficerRole = roles.find((r) => r.email.toLowerCase() === email.toLowerCase());
    } catch {}

    let eventRoles: any = [];
    try {
      const q = adminClient
        .from('event_roles')
        .select(`
          event_id,
          role_type,
          events (event_name, status, is_active, event_date, start_time, end_time)
        `);
      const res = typeof q.ilike === 'function' ? await q.ilike('email', email) : (typeof q.eq === 'function' ? await q.eq('email', email) : null);
      eventRoles = res?.data || [];
    } catch {}

    let createdEvents: any = [];
    try {
      const q = adminClient
        .from('events')
        .select('event_id, event_name, status, is_active, event_date, start_time, end_time');
      const res = typeof q.ilike === 'function' ? await q.ilike('created_by', email) : (typeof q.eq === 'function' ? await q.eq('created_by', email) : null);
      if (res?.data) createdEvents = res.data;
    } catch {}

    const lowerEmail = email.toLowerCase();
    const isSubAdminUnit =
      lowerEmail.startsWith('lcd') ||
      lowerEmail.startsWith('clb') ||
      lowerEmail.startsWith('doi') ||
      lowerEmail.includes('marketing') ||
      lowerEmail.includes('ketoan') ||
      lowerEmail.includes('quantri') ||
      lowerEmail.includes('vienthong') ||
      lowerEmail.includes('dientu') ||
      lowerEmail.includes('itmc');

    const isSuperAdmin =
      lowerEmail === ROOT_SUPER_ADMIN.toLowerCase() ||
      !!superAdmin ||
      assignedOfficerRole?.role_tier === 'super_admin';

    const isYouthUnion =
      lowerEmail.includes('doanthanhnien') ||
      lowerEmail.includes('bchdoan') ||
      assignedOfficerRole?.role_tier === 'youth_union';

    const isCtsv =
      lowerEmail.includes('phongctsv') ||
      lowerEmail.includes('ctsv') ||
      assignedOfficerRole?.role_tier === 'ctsv';

    const isFacility =
      lowerEmail.includes('phongquantri') ||
      lowerEmail.includes('quantri') ||
      lowerEmail.includes('tchc') ||
      lowerEmail.includes('tchcqt') ||
      lowerEmail.includes('csvc') ||
      assignedOfficerRole?.role_tier === 'facility';

    const isSecurity =
      lowerEmail.includes('baove') ||
      lowerEmail.includes('security') ||
      assignedOfficerRole?.role_tier === 'security';

    const isEventAdmin =
      isSuperAdmin ||
      isYouthUnion ||
      isCtsv ||
      isFacility ||
      isSubAdminUnit ||
      assignedOfficerRole?.role_tier === 'event_admin' ||
      (eventRoles?.some((r: any) => r.role_type === 'event_admin') ?? false) ||
      createdEvents.length > 0;

    const isChecker =
      isSuperAdmin ||
      isSecurity ||
      assignedOfficerRole?.role_tier === 'checker' ||
      (eventRoles?.some((r: any) => r.role_type === 'checker' || r.role_type === 'event_admin') ?? false);

    let tier: UserTier = 'user';
    if (isSuperAdmin) tier = 'super_admin';
    else if (isYouthUnion) tier = 'youth_union';
    else if (isCtsv) tier = 'ctsv';
    else if (isFacility) tier = 'facility';
    else if (isSecurity) tier = 'security';
    else if (isEventAdmin) tier = 'event_admin';
    else if (isChecker) tier = 'checker';

    const googleName = authMetadata?.full_name || authMetadata?.name;
    const avatarUrl = authMetadata?.avatar_url || authMetadata?.picture;

    let userRecord = user;

    // Auto-register student accounts with @student domain seamlessly
    if (!userRecord && email.includes('@student.')) {
      let className = 'PTIT-HCM';
      let actualName = googleName || username;

      const match = (googleName || '').match(/^([A-Z]\d{2}[A-Z0-9-]+)\s+(.+)$/i);
      if (match) {
        className = match[1].toUpperCase();
        actualName = match[2].trim();
      }

      try {
        if (adminClient.from('users')?.upsert) {
          await adminClient.from('users').upsert(
            {
              mssv: username,
              email,
              full_name: actualName,
              class_id: className,
            },
            { onConflict: 'email' }
          );
        }
      } catch (e) {}

      userRecord = {
        mssv: username,
        full_name: actualName,
        class_id: className,
      };
    }

    if (!userRecord) {
      userRecord = {
        mssv: username,
        full_name: googleName || username,
        class_id: 'PTIT-HCM',
      };
    }

    const defaultNames: Record<string, { mssv: string; name: string; classId: string }> = {
      youth_union: { mssv: 'DOAN-HV', name: 'Đ/c Bí Thư Đoàn Học Viện', classId: 'BCH-DOAN' },
      ctsv: { mssv: 'PHONG-CTSV', name: 'Phòng Công Tác Sinh Viên (CTSV)', classId: 'PHONG-BAN' },
      facility: { mssv: 'PHONG-TCHCQT', name: 'Phòng. TC-HC-QT', classId: 'PHONG-BAN' },
      security: { mssv: 'TO-BAOVE', name: 'Tổ Bảo Vệ (Bàn Giao Chìa Khóa)', classId: 'TO-BAO-VE' },
      super_admin: { mssv: 'SUPER_ADMIN', name: 'Super Admin Đoàn Trường', classId: 'SUPER-ADMIN' },
      event_admin: { mssv: 'EVENT_ADMIN', name: 'Admin Sự Kiện', classId: 'BAN-TO-CHUC' },
    };

    const roleDefaults = defaultNames[tier] || { mssv: username, name: 'Sinh Viên PTIT', classId: 'PTIT-HCM' };

    const profileExtra = getUserProfileExtra(email) || (userRecord?.mssv ? getUserProfileExtra(userRecord.mssv) : null) || getUserProfileExtra(username);

    const resolvedUser = {
      mssv: userRecord?.mssv || roleDefaults.mssv,
      full_name: userRecord?.full_name || googleName || roleDefaults.name,
      class_id: userRecord?.class_id || roleDefaults.classId,
      gender: profileExtra?.gender || (demoUser ? demoUser.gender : 'Nam'),
      phone: profileExtra?.phone !== undefined ? profileExtra.phone : (demoUser ? demoUser.phone : ''),
    };

    let managed_events: any[] = [];
    if (isSuperAdmin) {
      const { data: allEvents } = await adminClient
        .from('events')
        .select('event_id, event_name, status, is_active, event_date, start_time, end_time')
        .order('created_at', { ascending: false });

      managed_events = (allEvents || []).map((e: any) => ({
        event_id: e.event_id,
        event_name: e.event_name,
        role_type: 'event_admin',
        status: e.status,
        is_active: e.is_active,
        event_date: e.event_date,
        start_time: e.start_time,
        end_time: e.end_time,
      }));
    } else {
      const seenEventIds = new Set<string>();
      for (const r of eventRoles || []) {
        if (r.event_id && !seenEventIds.has(r.event_id)) {
          managed_events.push({
            event_id: r.event_id,
            event_name: r.events?.event_name || 'Không rõ',
            role_type: r.role_type,
            status: (r.events as any)?.status,
            is_active: (r.events as any)?.is_active,
            event_date: (r.events as any)?.event_date,
            start_time: (r.events as any)?.start_time,
            end_time: (r.events as any)?.end_time,
          });
          seenEventIds.add(r.event_id);
        }
      }
      for (const ce of createdEvents) {
        if (ce.event_id && !seenEventIds.has(ce.event_id)) {
          managed_events.push({
            event_id: ce.event_id,
            event_name: ce.event_name,
            role_type: 'event_admin',
            status: ce.status,
            is_active: ce.is_active,
            event_date: ce.event_date,
            start_time: ce.start_time,
            end_time: ce.end_time,
          });
          seenEventIds.add(ce.event_id);
        }
      }
    }

    const sessionUser: SessionUser = {
      mssv: resolvedUser.mssv,
      email,
      full_name: resolvedUser.full_name,
      class_id: resolvedUser.class_id,
      gender: resolvedUser.gender || 'Nam',
      phone: resolvedUser.phone || '',
      tier,
      isSuperAdmin,
      isEventAdmin,
      isChecker,
      avatar_url: avatarUrl,
      unit_name: assignedOfficerRole?.unit_name,
      unit_code: assignedOfficerRole?.unit_code,
      managed_events
    };

    return NextResponse.json({ success: true, data: sessionUser }, { headers: noCacheHeaders });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: err.message }, { status: 500, headers: noCacheHeaders });
  }
}

export async function PATCH(req: Request) {
  const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };

  try {
    const body = await req.json();
    const { gender, phone } = body;

    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('demo_session');
    
    // 1. If demo session, update demo cookie
    if (demoCookie?.value) {
      const demoUser = parseDemoCookie(demoCookie.value);
      if (demoUser && demoUser.email) {
        const updated = {
          ...demoUser,
          gender: gender || demoUser.gender || 'Nam',
          phone: phone !== undefined ? phone : demoUser.phone || '',
        };
        const { signCookie } = await import('@/app/api/auth/demo/route');
        cookieStore.set('demo_session', signCookie(JSON.stringify(updated)), {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7,
        });

        saveUserProfileExtra(demoUser.email, { gender: updated.gender, phone: updated.phone });
        if (demoUser.mssv) saveUserProfileExtra(demoUser.mssv, { gender: updated.gender, phone: updated.phone });

        return NextResponse.json({
          success: true,
          message: 'Đã cập nhật thông tin cá nhân thành công!',
          data: { gender: updated.gender, phone: updated.phone },
        }, { headers: noCacheHeaders });
      }
    }

    // 2. Supabase Auth Session
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noCacheHeaders });
    }

    const email = user.email.toLowerCase();
    const username = email.split('@')[0].toUpperCase();

    saveUserProfileExtra(email, { gender, phone });
    saveUserProfileExtra(username, { gender, phone });

    return NextResponse.json({
      success: true,
      message: 'Đã cập nhật thông tin cá nhân thành công!',
      data: { gender, phone },
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error('Update profile error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi cập nhật thông tin', message: err.message },
      { status: 500, headers: noCacheHeaders }
    );
  }
}
