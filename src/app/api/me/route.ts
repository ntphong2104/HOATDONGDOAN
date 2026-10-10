import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getStoredOfficerRoles, ROOT_SUPER_ADMIN } from '@/lib/constants/officers-store';
import { parseDemoCookie, getVerifiedUserFromCookies, invalidateAuthContextCache } from '@/lib/supabase/auth-helper';
import { getUserProfileExtra, saveUserProfileExtra } from '@/lib/constants/user-profile-store';
import type { SessionUser, UserTier } from '@/lib/types';
import { getOfficialTierForEmail } from '@/lib/auth/official-roles';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import {
  isPlaceholderName,
  isPlaceholderClass,
  parseGoogleStudentName,
  normalizeStudentFullName,
  normalizeStudentClassId,
  saveStudentProfile,
} from '@/lib/utils/student-profile';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

// In-memory cache for /api/me responses (TTL: 15 seconds) to prevent redundant DB hammering
const meResponseCache = new Map<string, { data: SessionUser; expiresAt: number }>();

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

  // Cryptographic Fast-path: Check verified token cache
  let email: string | null = null;
  let authMetadata: any = null;

  try {
    const cookieStore = await cookies();
    const verifiedUser = await getVerifiedUserFromCookies(supabase, cookieStore.getAll());
    if (verifiedUser?.email) {
      email = verifiedUser.email;
    }
  } catch {}

  // If email found, check in-memory cache first (TTL: 15s)
  if (email) {
    const cached = meResponseCache.get(email.toLowerCase());
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ success: true, data: cached.data }, { headers: noCacheHeaders });
    }
  }

  if (!email && typeof supabase.auth.getSession === 'function') {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user?.email) {
        email = data.session.user.email;
        authMetadata = data.session.user.user_metadata;
      }
    } catch {}
  }

  if (!email && typeof supabase.auth.getUser === 'function') {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) {
        email = data.user.email;
        authMetadata = data.user.user_metadata;
      }
    } catch {}
  }

  if (!email) {
    return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  // Check cache again after fallback retrieval
  const cached = meResponseCache.get(email.toLowerCase());
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data }, { headers: noCacheHeaders });
  }
  
  try {
    const username = email.split('@')[0].toUpperCase();

    // Run all 5 user data queries in parallel
    const [userResult, superAdminResult, officerRolesResult, eventRolesResult, createdEventsResult] = await Promise.all([
      // 1. User profile
      Promise.resolve(
        adminClient
          .from('users')
          .select('mssv, full_name, class_id')
          .or(`email.ilike.${email},mssv.ilike.${username}`)
          .maybeSingle()
      )
        .then(r => r.data)
        .catch(() => null),

      // 2. Super admin check
      (async () => {
        try {
          const q = adminClient.from('super_admins').select('email');
          const res = typeof q.ilike === 'function' ? await q.ilike('email', email).maybeSingle() : (typeof q.eq === 'function' ? await q.eq('email', email).single() : null);
          return res?.data || null;
        } catch {
          try {
            const q = adminClient.from('super_admins').select('email');
            const res = typeof q.eq === 'function' ? await q.eq('email', email) : null;
            return Array.isArray(res?.data) ? res.data[0] : res?.data;
          } catch { return null; }
        }
      })(),

      // 3. Officer roles
      getStoredOfficerRoles(adminClient)
        .then(roles => roles.find((r) => r.email.toLowerCase() === email.toLowerCase()) || null)
        .catch(() => null),

      // 4. Event roles
      (async () => {
        try {
          const q = adminClient
            .from('event_roles')
            .select(`
              event_id,
              role_type,
              events (event_name, status, is_active, event_date, start_time, end_time)
            `);
          const res = typeof q.ilike === 'function' ? await q.ilike('email', email) : (typeof q.eq === 'function' ? await q.eq('email', email) : null);
          return res?.data || [];
        } catch { return []; }
      })(),

      // 5. Created events
      (async () => {
        try {
          const q = adminClient
            .from('events')
            .select('event_id, event_name, status, is_active, event_date, start_time, end_time');
          const res = typeof q.ilike === 'function' ? await q.ilike('created_by', email) : (typeof q.eq === 'function' ? await q.eq('created_by', email) : null);
          return res?.data || [];
        } catch { return []; }
      })(),
    ]);

    const user = userResult;
    const superAdmin = superAdminResult;
    const assignedOfficerRole = officerRolesResult;
    const eventRoles = eventRolesResult;
    const createdEvents = createdEventsResult;

    const lowerEmail = email.toLowerCase();
    // SECURITY: exact-match allowlist for official approver accounts
    const officialTier = getOfficialTierForEmail(lowerEmail);
    const isSubAdminUnit =
      lowerEmail.startsWith('lcd') ||
      lowerEmail.startsWith('clb') ||
      lowerEmail.startsWith('doi') ||
      lowerEmail.includes('marketing') ||
      lowerEmail.includes('ketoan') ||
      lowerEmail.includes('vienthong') ||
      lowerEmail.includes('dientu') ||
      lowerEmail.includes('itmc');

    const isSuperAdmin =
      lowerEmail === ROOT_SUPER_ADMIN.toLowerCase() ||
      !!superAdmin ||
      assignedOfficerRole?.role_tier === 'super_admin';

    const isYouthUnion =
      officialTier === 'youth_union' ||
      assignedOfficerRole?.role_tier === 'youth_union';

    const isCtsv =
      officialTier === 'ctsv' ||
      assignedOfficerRole?.role_tier === 'ctsv';

    const isFacility =
      officialTier === 'facility' ||
      assignedOfficerRole?.role_tier === 'facility';

    const isSecurity =
      officialTier === 'security' ||
      assignedOfficerRole?.role_tier === 'security';

    // Students who only have event_roles but are not officers/sub-admin units
    // should NOT be promoted to event_admin tier — they stay as 'user' with managed_events
    const isOfficerLevelAdmin =
      isSuperAdmin ||
      isYouthUnion ||
      isCtsv ||
      isFacility ||
      isSubAdminUnit ||
      assignedOfficerRole?.role_tier === 'event_admin';

    const hasEventRolesOnly =
      !isOfficerLevelAdmin &&
      ((eventRoles?.some((r: any) => r.role_type === 'event_admin') ?? false) ||
        createdEvents.length > 0);

    const isEventAdmin = isOfficerLevelAdmin || hasEventRolesOnly;

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
    else if (isOfficerLevelAdmin) tier = 'event_admin';
    else if (isChecker) tier = 'checker';
    // hasEventRolesOnly students stay tier = 'user'

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

    // ── Student profile completeness ──
    // MSSV-only imports create placeholder profiles (name = MSSV, class = PTIT-HCM).
    // 1) Try to heal silently from the Google display name ("D25CQMR02-N LE NGOC BAO LINH").
    // 2) If still incomplete, flag it so the UI forces the student to enter it.
    const studentMssv = extractMSSV(email);
    let profileIncomplete = false;
    const profileMissingFields: ('full_name' | 'class_id')[] = [];
    if (studentMssv && !isSuperAdmin) {
      const needName = isPlaceholderName(userRecord?.full_name, studentMssv);
      const needClass = isPlaceholderClass(userRecord?.class_id);
      if (needName || needClass) {
        const parsed = parseGoogleStudentName(googleName);
        const healName = needName ? normalizeStudentFullName(parsed.full_name) : null;
        const healClass = needClass ? normalizeStudentClassId(parsed.class_id) : null;
        if (healName || healClass) {
          const saved = await saveStudentProfile(adminClient, {
            mssv: studentMssv,
            email,
            full_name: healName,
            class_id: healClass,
          });
          if (saved.ok) {
            userRecord = {
              ...userRecord,
              mssv: userRecord?.mssv || studentMssv,
              full_name: healName || userRecord?.full_name,
              class_id: healClass || userRecord?.class_id,
            };
          }
        }
      }
      if (isPlaceholderName(userRecord?.full_name, studentMssv)) profileMissingFields.push('full_name');
      if (isPlaceholderClass(userRecord?.class_id)) profileMissingFields.push('class_id');
      profileIncomplete = profileMissingFields.length > 0;
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
      gender: profileExtra?.gender || 'Nam',
      phone: profileExtra?.phone !== undefined ? profileExtra.phone : '',
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
            event_name: (r.events as any)?.event_name || 'Không rõ',
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
      managed_events,
      profile_incomplete: profileIncomplete,
      profile_missing_fields: profileMissingFields,
    };

    meResponseCache.set(email.toLowerCase(), { data: sessionUser, expiresAt: Date.now() + 15000 });
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

        // Persist to Supabase for durability across restarts
        try {
          const supabase = await createAdminClient();
          const profileKey = `user_profile_${demoUser.email.toLowerCase()}`;
          await supabase.from('system_settings').upsert({
            key: profileKey,
            value: { gender: updated.gender, phone: updated.phone, updated_at: new Date().toISOString() },
          }, { onConflict: 'key' });
        } catch {}

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

    // ── Real name / class (students only) ──
    const wantsIdentityUpdate = body.full_name !== undefined || body.class_id !== undefined;
    let savedIdentity: { full_name?: string; class_id?: string } = {};
    if (wantsIdentityUpdate) {
      const studentMssv = extractMSSV(email);
      if (!studentMssv) {
        return NextResponse.json(
          { success: false, error: 'Chỉ tài khoản sinh viên mới cập nhật họ tên / lớp tại đây' },
          { status: 403, headers: noCacheHeaders }
        );
      }
      const fullName = body.full_name !== undefined ? normalizeStudentFullName(body.full_name) : null;
      const classId = body.class_id !== undefined ? normalizeStudentClassId(body.class_id) : null;
      if (body.full_name !== undefined && !fullName) {
        return NextResponse.json(
          { success: false, error: 'Họ và tên không hợp lệ (ghi đầy đủ họ và tên, chỉ gồm chữ cái).' },
          { status: 400, headers: noCacheHeaders }
        );
      }
      if (body.class_id !== undefined && !classId) {
        return NextResponse.json(
          { success: false, error: 'Mã lớp không hợp lệ (ví dụ: D25CQMR02-N).' },
          { status: 400, headers: noCacheHeaders }
        );
      }
      const adminSupabase = await createAdminClient();

      // Only allow filling in values that are still placeholders — a recorded real
      // name/class can't be overwritten by the student (contact Đoàn to correct it).
      const { data: currentRow } = await adminSupabase
        .from('users')
        .select('full_name, class_id')
        .ilike('mssv', studentMssv)
        .maybeSingle();
      const nameLocked = currentRow && !isPlaceholderName(currentRow.full_name, studentMssv);
      const classLocked = currentRow && !isPlaceholderClass(currentRow.class_id);
      if ((fullName && nameLocked && fullName !== currentRow.full_name) ||
          (classId && classLocked && classId !== currentRow.class_id)) {
        return NextResponse.json(
          { success: false, error: 'Thông tin họ tên / lớp đã được ghi nhận. Liên hệ Đoàn trường nếu cần chỉnh sửa.' },
          { status: 403, headers: noCacheHeaders }
        );
      }

      const saved = await saveStudentProfile(adminSupabase, {
        mssv: studentMssv,
        email,
        full_name: fullName,
        class_id: classId,
      });
      if (!saved.ok) {
        console.error('[me PATCH] saveStudentProfile failed:', saved.error);
        return NextResponse.json(
          { success: false, error: 'Không lưu được thông tin, vui lòng thử lại.' },
          { status: 500, headers: noCacheHeaders }
        );
      }
      if (fullName) savedIdentity.full_name = fullName;
      if (classId) savedIdentity.class_id = classId;
    }

    meResponseCache.delete(email);
    invalidateAuthContextCache(email);

    const wantsExtraUpdate = gender !== undefined || phone !== undefined;
    if (wantsExtraUpdate) {
      const extraPatch: Record<string, any> = {};
      if (gender !== undefined) extraPatch.gender = gender;
      if (phone !== undefined) extraPatch.phone = phone;
      saveUserProfileExtra(email, extraPatch);
      saveUserProfileExtra(username, extraPatch);

      // Persist to Supabase for durability across restarts
      try {
        const supabase = await createAdminClient();
        const profileKey = `user_profile_${email}`;
        const merged = getUserProfileExtra(email) || extraPatch;
        await supabase.from('system_settings').upsert({
          key: profileKey,
          value: { gender: merged.gender, phone: merged.phone, updated_at: new Date().toISOString() },
        }, { onConflict: 'key' });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: 'Đã cập nhật thông tin cá nhân thành công!',
      data: { gender, phone, ...savedIdentity },
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error('Update profile error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi cập nhật thông tin', message: err.message },
      { status: 500, headers: noCacheHeaders }
    );
  }
}
