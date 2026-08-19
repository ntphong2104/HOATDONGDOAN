import { cookies } from 'next/headers';
import { createClient, createAdminClient } from './server';
import { getStoredOfficerRoles, ROOT_SUPER_ADMIN } from '@/lib/constants/officers-store';
import type { UserTier } from '@/lib/types';
import crypto from 'crypto';

const COOKIE_SECRET = process.env.DEMO_COOKIE_SECRET || 'dev-cookie-secret';

export function parseDemoCookie(cookieVal: string): any | null {
  if (!cookieVal) return null;
  try {
    let str = cookieVal.trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    }
    const lastDot = str.lastIndexOf('.');
    if (lastDot !== -1 && str.length - lastDot === 65) {
      str = str.slice(0, lastDot);
    }

    for (let i = 0; i < 3; i++) {
      try {
        const parsed = JSON.parse(str);
        if (parsed && typeof parsed === 'object' && (parsed.email || parsed.tier)) {
          return parsed;
        }
      } catch {}
      try {
        const next = decodeURIComponent(str);
        if (next === str) break;
        str = next;
      } catch {
        break;
      }
    }
  } catch {}
  return null;
}

export interface AuthContext {
  email: string;
  isSuperAdmin: boolean;
  isEventAdmin: boolean;
  isChecker: boolean;
  isSecurity: boolean;
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
        const lowerEmail = demoUser.email.toLowerCase();
        const explicitTier = (demoUser.tier || 'user') as UserTier;
        const isSuperAdmin = explicitTier === 'super_admin' || lowerEmail === 'n22dccn158@student.ptithcm.edu.vn';
        const isYouthUnion = explicitTier === 'youth_union' || lowerEmail.includes('doanthanhnien');
        const isCtsv = explicitTier === 'ctsv' || lowerEmail.includes('phongctsv');
        const isFacility = explicitTier === 'facility' || lowerEmail.includes('phongquantri') || lowerEmail.includes('quantri') || lowerEmail.includes('tchc') || lowerEmail.includes('csvc');
        const isSecurity = explicitTier === 'security' || lowerEmail.includes('baove') || lowerEmail.includes('security');
        const isEventAdmin = isSuperAdmin || isYouthUnion || isCtsv || isFacility || explicitTier === 'event_admin';
        const isChecker = isEventAdmin || isSecurity || explicitTier === 'checker';

        return {
          email: demoUser.email,
          isSuperAdmin,
          isEventAdmin,
          isChecker,
          isSecurity,
          tier: explicitTier,
        };
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

  if (explicitTier) {
    const lowerEmail = email.toLowerCase();
    const isSuperAdmin = explicitTier === 'super_admin' || lowerEmail === 'n22dccn158@student.ptithcm.edu.vn';
    const isYouthUnion = explicitTier === 'youth_union' || lowerEmail.includes('doanthanhnien');
    const isCtsv = explicitTier === 'ctsv' || lowerEmail.includes('phongctsv');
    const isFacility = explicitTier === 'facility' || lowerEmail.includes('phongquantri');
    const isSecurity = explicitTier === 'security' || lowerEmail.includes('baove') || lowerEmail.includes('security');
    const isEventAdmin = isSuperAdmin || isYouthUnion || isCtsv || isFacility || explicitTier === 'event_admin';
    const isChecker = isEventAdmin || isSecurity || explicitTier === 'checker';

    return {
      email,
      isSuperAdmin,
      isEventAdmin,
      isChecker,
      isSecurity,
      tier: explicitTier,
    };
  }

  const adminClient = (typeof createAdminClient === 'function' ? await createAdminClient() : null) || supabase;

  // Check super_admins table
  let superAdmin: any = null;
  try {
    const q = adminClient.from('super_admins').select('email');
    const { data } = typeof q.ilike === 'function'
      ? await q.ilike('email', email).maybeSingle()
      : await q.eq('email', email).maybeSingle();
    superAdmin = data;
  } catch {}

  // Check dynamic officer_roles via persistent store
  let assignedOfficerRole: any = null;
  try {
    const roles = await getStoredOfficerRoles(adminClient);
    assignedOfficerRole = roles.find((r) => r.email.toLowerCase() === email.toLowerCase());
  } catch {}

  // Check event_roles table
  let eventRoles: any = [];
  try {
    const q = adminClient.from('event_roles').select('role_type');
    const { data } = typeof q.ilike === 'function'
      ? await q.ilike('email', email)
      : await q.eq('email', email);
    eventRoles = data || [];
  } catch {}

  // Check if created any events
  let hasCreatedEvents = false;
  try {
    const q = adminClient.from('events').select('event_id');
    const { data } = typeof q.ilike === 'function'
      ? await q.ilike('created_by', email).limit(1)
      : await q.eq('created_by', email).limit(1);
    hasCreatedEvents = Boolean(data && data.length > 0);
  } catch {}

  const lowerEmail = email.toLowerCase();
  const isSubAdminUnit = lowerEmail.startsWith('lcd') || lowerEmail.startsWith('clb') || lowerEmail.startsWith('doi');

  const isSuperAdmin =
    lowerEmail === ROOT_SUPER_ADMIN.toLowerCase() ||
    !!superAdmin ||
    assignedOfficerRole?.role_tier === 'super_admin' ||
    explicitTier === 'super_admin';

  const isYouthUnion =
    lowerEmail.includes('doanthanhnien') ||
    lowerEmail.includes('bchdoan') ||
    assignedOfficerRole?.role_tier === 'youth_union' ||
    assignedOfficerRole?.unit_code === 'BCH_DOAN' ||
    explicitTier === 'youth_union';

  const isCtsv =
    lowerEmail.includes('phongctsv') ||
    lowerEmail.includes('ctsv') ||
    assignedOfficerRole?.role_tier === 'ctsv' ||
    assignedOfficerRole?.unit_code === 'PHONG_CTSV' ||
    explicitTier === 'ctsv';

  const isFacility =
    lowerEmail.includes('phongquantri') ||
    lowerEmail.includes('quantri') ||
    lowerEmail.includes('tchc') ||
    lowerEmail.includes('tchcqt') ||
    lowerEmail.includes('csvc') ||
    assignedOfficerRole?.role_tier === 'facility' ||
    assignedOfficerRole?.unit_code === 'PHONG_TCHCQT' ||
    explicitTier === 'facility';

  const isSecurity =
    lowerEmail.includes('baove') ||
    lowerEmail.includes('security') ||
    assignedOfficerRole?.role_tier === 'security' ||
    assignedOfficerRole?.unit_code === 'TO_BAO_VE' ||
    explicitTier === 'security';

  const isEventAdmin =
    isSuperAdmin ||
    isYouthUnion ||
    isCtsv ||
    isFacility ||
    hasCreatedEvents ||
    assignedOfficerRole?.role_tier === 'event_admin' ||
    (eventRoles?.some((r: any) => r.role_type === 'event_admin') ?? false) ||
    explicitTier === 'event_admin';

  const isChecker =
    isSuperAdmin ||
    isSecurity ||
    assignedOfficerRole?.role_tier === 'checker' ||
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
  } else if (isSecurity) {
    tier = 'security';
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
    isSecurity,
    tier,
  };
}
