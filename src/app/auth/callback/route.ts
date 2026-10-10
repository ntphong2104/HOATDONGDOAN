import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isValidSchoolEmail, extractMSSV } from '@/lib/utils/extract-mssv';
import { getOfficialTierForEmail } from '@/lib/auth/official-roles';
import { getStoredOfficerRoles } from '@/lib/constants/officers-store';
import {
  isPlaceholderName,
  isPlaceholderClass,
  parseGoogleStudentName,
  normalizeStudentFullName,
  normalizeStudentClassId,
} from '@/lib/utils/student-profile';

function getPublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';

  // Prioritize reverse proxy headers (e.g. ptithcm.com)
  if (
    forwardedHost &&
    !forwardedHost.includes('127.0.0.1') &&
    !forwardedHost.includes('localhost') &&
    !forwardedHost.includes('0.0.0.0')
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // In production VPS environment, default to production domain
  if (process.env.NODE_ENV === 'production') {
    return 'https://ptithcm.com';
  }

  const { origin } = new URL(request.url);
  return origin;
}

export async function GET(request: Request) {
  const origin = getPublicOrigin(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  try {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !session?.user?.email) {
      console.error('exchangeCodeForSession error:', error);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    const email = session.user.email.toLowerCase().trim();

    // Run all auth checks in parallel for faster response
    const [superAdminResult, registeredUserResult, eventRolesResult] = await Promise.all([
      // 1. Check super admin
      (async () => {
        try {
          const res = await supabase
            .from('super_admins')
            .select('email')
            .ilike('email', email)
            .maybeSingle();
          return res.data;
        } catch { return null; }
      })(),
      // 2. Check registered student or unit in users table
      (async () => {
        try {
          const res = await supabase
            .from('users')
            .select('email')
            .ilike('email', email)
            .maybeSingle();
          return res.data;
        } catch { return null; }
      })(),
      // 3. Check event role
      (async () => {
        try {
          const res = await supabase
            .from('event_roles')
            .select('role_type')
            .ilike('email', email);
          return res.data || [];
        } catch { return []; }
      })(),
    ]);

    const superAdmin = superAdminResult;
    const registeredUser = registeredUserResult;
    const eventRoles = eventRolesResult;

    const isSuperAdmin = !!superAdmin || email === 'n22dccn158@student.ptithcm.edu.vn';
    const isEventAdmin = eventRoles?.some((r) => r.role_type === 'event_admin');
    const isChecker = eventRoles?.some((r) => r.role_type === 'checker');

    const isAuthorized = isSuperAdmin || !!registeredUser || (eventRoles && eventRoles.length > 0) || isValidSchoolEmail(email);

    if (!isAuthorized) {
      try {
        const adminSupabase = await createAdminClient();
        if (session.user.id && adminSupabase) {
          await adminSupabase.auth.admin.deleteUser(session.user.id);
        }
      } catch {}
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=invalid_domain`);
    }

    // Check or auto-register student user in users table only if it's a real student email with MSSV format
    const studentMssv = extractMSSV(email);

    if (studentMssv) {
      try {
        // Check existing user in users table first
        const { data: existingUser } = await supabase
          .from('users')
          .select('mssv, full_name, class_id')
          .or(`email.ilike.${email},mssv.ilike.${studentMssv}`)
          .maybeSingle();

        const rawName =
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          '';

        // Keep existing REAL values; replace placeholders (name = MSSV, class = PTIT-HCM)
        // with what the Google account provides ("D22CQCN02-N NGUYEN THANH PHONG").
        const parsedGoogle = parseGoogleStudentName(rawName);
        const googleName = normalizeStudentFullName(parsedGoogle.full_name);
        const googleClass = normalizeStudentClassId(parsedGoogle.class_id);

        const className = !isPlaceholderClass(existingUser?.class_id)
          ? existingUser!.class_id
          : (googleClass || 'PTIT-HCM');
        const actualName = !isPlaceholderName(existingUser?.full_name, studentMssv)
          ? existingUser!.full_name
          : (googleName || existingUser?.full_name || studentMssv);

        await supabase.from('users').upsert(
          {
            mssv: studentMssv,
            email,
            full_name: actualName,
            class_id: className,
          },
          { onConflict: 'email' }
        );
      } catch (upsertErr) {
        console.error('Student upsert error:', upsertErr);
      }
    }

    const isSubAdminUnit =
      email.startsWith('lcd') ||
      email.startsWith('clb') ||
      email.startsWith('doi') ||
      email.includes('marketing') ||
      email.includes('ketoan') ||
      email.includes('vienthong') ||
      email.includes('dientu') ||
      email.includes('itmc') ||
      isEventAdmin;

    // If a specific target page was requested (e.g. /events/[id]/register)
    const nextTarget = searchParams.get('next') || searchParams.get('redirect');
    if (nextTarget && nextTarget.startsWith('/') && nextTarget !== '/login') {
      return NextResponse.redirect(`${origin}${nextTarget}`);
    }

    // Smart role-based redirection
    if (isSuperAdmin) {
      return NextResponse.redirect(`${origin}/super-admin`);
    }

    // Department approvers: exact allowlist or officer registry (no substring matching)
    let departmentTier: string | null = getOfficialTierForEmail(email);
    if (!departmentTier) {
      try {
        const stored = await getStoredOfficerRoles(await createAdminClient());
        departmentTier = stored.find((o) => o.email.toLowerCase().trim() === email)?.role_tier || null;
      } catch {}
    }
    if (departmentTier === 'youth_union' || departmentTier === 'ctsv' || departmentTier === 'facility') {
      return NextResponse.redirect(`${origin}/admin/proposals`);
    }
    if (departmentTier === 'security') {
      return NextResponse.redirect(`${origin}/security`);
    }
    if (isSubAdminUnit) {
      return NextResponse.redirect(`${origin}/admin`);
    }
    if (isChecker) {
      return NextResponse.redirect(`${origin}/scanner`);
    }

    return NextResponse.redirect(`${origin}/`);
  } catch (err) {
    console.error('Callback error:', err);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }
}
