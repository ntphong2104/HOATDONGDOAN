import { cookies } from 'next/headers';
import { createClient } from './server';
import type { UserTier } from '@/lib/types';
import crypto from 'crypto';

const COOKIE_SECRET = process.env.DEMO_COOKIE_SECRET || 'dev-cookie-secret';

function parseDemoCookie(cookieVal: string): any | null {
  if (!cookieVal) return null;
  try {
    let raw = cookieVal.trim();
    // Only strip signature if it matches .[64-hex-chars] at the very end
    const sigMatch = raw.match(/^(.+)\.[0-9a-fA-F]{64}$/);
    if (sigMatch) {
      raw = sigMatch[1];
    }
    try {
      const user = JSON.parse(decodeURIComponent(raw));
      if (user && user.email) return user;
    } catch {
      const user = JSON.parse(raw);
      if (user && user.email) return user;
    }
  } catch {}
  return null;
}

export interface AuthContext {
  email: string;
  isSuperAdmin: boolean;
  isEventAdmin: boolean;
  isChecker: boolean;
  tier: UserTier;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  let email: string | null = null;
  let explicitTier: UserTier | null = null;

  try {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('demo_session');
    if (demoCookie?.value) {
      const demoUser = parseDemoCookie(demoCookie.value);
      if (demoUser?.email) {
        email = demoUser.email;
        if (demoUser.tier) {
          explicitTier = demoUser.tier;
        }
      }
    }
  } catch {}

  const supabase = await createClient();

  if (!email) {
    try {
      if (supabase.auth?.getUser) {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.email) {
          email = data.user.email;
        }
      }
    } catch {}

    if (!email) {
      try {
        if (supabase.auth?.getSession) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user?.email) {
            email = data.session.user.email;
          }
        }
      } catch {}
    }
  }

  if (!email) {
    return null;
  }

  // Check super_admins table
  let superAdmin: any = null;
  try {
    const { data } = await supabase
      .from('super_admins')
      .select('email')
      .ilike('email', email)
      .maybeSingle();
    superAdmin = data;
  } catch {}

  // Check dynamic officer_roles table / system_settings
  let assignedOfficerRole: any = null;
  try {
    const { data: offRole } = await supabase
      .from('officer_roles')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (offRole) assignedOfficerRole = offRole;
  } catch {}

  if (!assignedOfficerRole) {
    try {
      const { data: settingData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'officer_roles')
        .maybeSingle();
      if (settingData?.value && Array.isArray(settingData.value)) {
        const found = settingData.value.find((r: any) => r.email.toLowerCase() === email.toLowerCase());
        if (found) assignedOfficerRole = found;
      }
    } catch {}
  }

  // Check event_roles table
  let eventRoles: any = [];
  try {
    const { data } = await supabase
      .from('event_roles')
      .select('role_type')
      .ilike('email', email);
    eventRoles = data || [];
  } catch {}

  const lowerEmail = email.toLowerCase();
  const isSubAdminUnit = lowerEmail.startsWith('lcd') || lowerEmail.startsWith('clb') || lowerEmail.startsWith('doi');

  const isSuperAdmin =
    !!superAdmin ||
    explicitTier === 'super_admin' ||
    assignedOfficerRole?.role_tier === 'super_admin' ||
    lowerEmail === 'n22dccn158@student.ptithcm.edu.vn';

  const isYouthUnion =
    explicitTier === 'youth_union' ||
    assignedOfficerRole?.role_tier === 'youth_union' ||
    lowerEmail.includes('doanthanhnien');

  const isCtsv =
    explicitTier === 'ctsv' ||
    assignedOfficerRole?.role_tier === 'ctsv' ||
    lowerEmail.includes('ctsv');

  const isFacility =
    explicitTier === 'facility' ||
    assignedOfficerRole?.role_tier === 'facility' ||
    lowerEmail.includes('quantri') ||
    lowerEmail.includes('csvc');

  const isEventAdmin =
    isSuperAdmin ||
    isYouthUnion ||
    isCtsv ||
    isFacility ||
    isSubAdminUnit ||
    assignedOfficerRole?.role_tier === 'event_admin' ||
    (eventRoles?.some((r: any) => r.role_type === 'event_admin') ?? false) ||
    explicitTier === 'event_admin';

  const isChecker =
    isSuperAdmin ||
    isSubAdminUnit ||
    (eventRoles?.some((r: any) => r.role_type === 'checker' || r.role_type === 'event_admin') ?? false) ||
    explicitTier === 'checker';

  let tier: UserTier = explicitTier || 'user';
  if (isSuperAdmin) {
    tier = 'super_admin';
  } else if (isYouthUnion) {
    tier = 'youth_union';
  } else if (isCtsv) {
    tier = 'ctsv';
  } else if (isFacility) {
    tier = 'facility';
  } else if (isEventAdmin) {
    tier = 'event_admin';
  } else if (isChecker) {
    tier = 'checker';
  }

  return {
    email,
    isSuperAdmin,
    isEventAdmin,
    isChecker,
    tier,
  };
}
