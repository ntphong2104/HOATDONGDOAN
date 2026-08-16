import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getStoredOfficerRoles } from '@/lib/constants/officers-store';
import type { SessionUser, UserTier } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };

  try {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('demo_session');
    if (demoCookie?.value) {
      let raw = demoCookie.value.trim();
      const sigMatch = raw.match(/^(.+)\.[0-9a-fA-F]{64}$/);
      if (sigMatch) {
        raw = sigMatch[1];
      }
      let demoUser: any = null;
      try {
        demoUser = JSON.parse(decodeURIComponent(raw));
      } catch {
        try {
          demoUser = JSON.parse(raw);
        } catch {}
      }
      if (demoUser && demoUser.email) {
        return NextResponse.json({ success: true, data: demoUser }, { headers: noCacheHeaders });
      }
    }
  } catch {
    // Non-request context fallback
  }

  const supabase = await createClient();
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
    const { data: user } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .eq('email', email)
      .single();

    let superAdmin = null;
    try {
      const res = await supabase.from('super_admins').select('email').eq('email', email).single();
      superAdmin = res?.data || null;
    } catch {
      try {
        const res = await supabase.from('super_admins').select('email').eq('email', email);
        superAdmin = Array.isArray(res?.data) ? res.data[0] : res?.data;
      } catch {}
    }

    // Check dynamic officer_roles via persistent store
    let assignedOfficerRole: any = null;
    try {
      const roles = await getStoredOfficerRoles(supabase);
      assignedOfficerRole = roles.find((r) => r.email.toLowerCase() === email.toLowerCase());
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
        .eq('email', email);
      eventRoles = res?.data || [];
    } catch {}

    const isSuperAdmin =
      !!superAdmin ||
      assignedOfficerRole?.role_tier === 'super_admin' ||
      email.toLowerCase() === 'n22dccn158@student.ptithcm.edu.vn';

    const isYouthUnion =
      assignedOfficerRole?.role_tier === 'youth_union';

    const isCtsv =
      assignedOfficerRole?.role_tier === 'ctsv';

    const isFacility =
      assignedOfficerRole?.role_tier === 'facility';

    const isSubAdminUnit =
      email.toLowerCase().startsWith('lcd') ||
      email.toLowerCase().startsWith('clb') ||
      email.toLowerCase().startsWith('doi') ||
      assignedOfficerRole?.role_tier === 'event_admin';
      email.toLowerCase().startsWith('clb') ||
      email.toLowerCase().startsWith('doi');

    const isEventAdmin =
      isSuperAdmin ||
      isYouthUnion ||
      isCtsv ||
      isFacility ||
      isSubAdminUnit ||
      assignedOfficerRole?.role_tier === 'event_admin' ||
      (eventRoles?.some(r => r.role_type === 'event_admin') ?? false);

    const isChecker =
      isSuperAdmin ||
      isSubAdminUnit ||
      (eventRoles?.some(r => r.role_type === 'checker' || r.role_type === 'event_admin') ?? false);

    let tier: UserTier = 'user';
    if (isSuperAdmin) tier = 'super_admin';
    else if (isYouthUnion) tier = 'youth_union';
    else if (isCtsv) tier = 'ctsv';
    else if (isFacility) tier = 'facility';
    else if (isEventAdmin) tier = 'event_admin';
    else if (isChecker) tier = 'checker';

    const googleName = authMetadata?.full_name || authMetadata?.name;
    const avatarUrl = authMetadata?.avatar_url || authMetadata?.picture;
    const username = email.split('@')[0].toUpperCase();

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
        if (supabase.from('users')?.upsert) {
          await supabase.from('users').upsert(
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

    // If not a registered student and not any admin/approver role
    if (!userRecord && !isSuperAdmin && !isEventAdmin && !isChecker && tier === 'user') {
      return NextResponse.json({ success: false, error: 'Not Found', message: 'Tài khoản chưa được đăng ký trong hệ thống' }, { status: 404 });
    }

    const defaultNames: Record<string, { mssv: string; name: string; classId: string }> = {
      youth_union: { mssv: 'DOAN-HV', name: 'Đ/c Bí Thư Đoàn Học Viện', classId: 'BCH-DOAN' },
      ctsv: { mssv: 'PHONG-CTSV', name: 'Phòng Công Tác Sinh Viên (CTSV)', classId: 'PHONG-BAN' },
      facility: { mssv: 'PHONG-CSVC', name: 'Phòng Quản Trị CSVC & Tổ Chức', classId: 'PHONG-BAN' },
      super_admin: { mssv: 'SUPER_ADMIN', name: 'Super Admin Đoàn Trường', classId: 'SUPER-ADMIN' },
      event_admin: { mssv: 'EVENT_ADMIN', name: 'Admin Sự Kiện', classId: 'BAN-TO-CHUC' },
    };

    const roleDefaults = defaultNames[tier] || { mssv: username, name: 'Sinh Viên PTIT', classId: 'PTIT-HCM' };

    const resolvedUser = {
      mssv: userRecord?.mssv || roleDefaults.mssv,
      full_name: userRecord?.full_name || googleName || roleDefaults.name,
      class_id: userRecord?.class_id || roleDefaults.classId,
    };

    let managed_events: any[] = [];
    if (isSuperAdmin) {
      const { data: allEvents } = await supabase
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
      managed_events = (eventRoles || []).map((r: any) => ({
        event_id: r.event_id,
        event_name: r.events?.event_name || 'Không rõ',
        role_type: r.role_type,
        status: (r.events as any)?.status,
        is_active: (r.events as any)?.is_active,
        event_date: (r.events as any)?.event_date,
        start_time: (r.events as any)?.start_time,
        end_time: (r.events as any)?.end_time,
      }));
    }

    const sessionUser: SessionUser = {
      mssv: resolvedUser.mssv,
      email,
      full_name: resolvedUser.full_name,
      class_id: resolvedUser.class_id,
      tier,
      avatar_url: avatarUrl,
      managed_events
    };

    return NextResponse.json({ success: true, data: sessionUser }, { headers: noCacheHeaders });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: err.message }, { status: 500, headers: noCacheHeaders });
  }
}
