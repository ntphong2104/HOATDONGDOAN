import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidSchoolEmail, extractMSSV } from '@/lib/utils/extract-mssv';

function getPublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost && !forwardedHost.includes('0.0.0.0') && !forwardedHost.includes('127.0.0.1')) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const { origin } = new URL(request.url);
  if (origin.includes('0.0.0.0') || origin.includes('127.0.0.1')) {
    return 'https://ptithcm.com';
  }
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
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    const email = session.user.email.toLowerCase().trim();

    // 1. Check super admin
    const { data: superAdmin } = await supabase
      .from('super_admins')
      .select('email')
      .ilike('email', email)
      .single();

    // 2. Check registered student or unit in users table
    const { data: registeredUser } = await supabase
      .from('users')
      .select('email')
      .ilike('email', email)
      .single();

    // 3. Check event role
    const { data: eventRoles } = await supabase
      .from('event_roles')
      .select('role_type')
      .ilike('email', email);

    const isSuperAdmin = !!superAdmin;
    const isEventAdmin = eventRoles?.some((r) => r.role_type === 'event_admin');
    const isChecker = eventRoles?.some((r) => r.role_type === 'checker');

    const isAuthorized = isSuperAdmin || !!registeredUser || (eventRoles && eventRoles.length > 0) || isValidSchoolEmail(email);

    if (!isAuthorized) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=invalid_domain`);
    }

    // Check or auto-register student user in users table only if it's a real student email with MSSV format
    const studentMssv = extractMSSV(email);

    if (studentMssv) {
      const rawName =
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        '';

      let className = 'PTIT-HCM';
      let actualName = rawName || studentMssv;

      // PTIT Google account name format: "D22CQCN02-N NGUYEN THANH PHONG"
      const match = rawName.match(/^([A-Z]\d{2}[A-Z0-9-]+)\s+(.+)$/i);
      if (match) {
        className = match[1].toUpperCase();
        actualName = match[2].trim();
      }

      await supabase.from('users').upsert(
        {
          mssv: studentMssv,
          email,
          full_name: actualName,
          class_id: className,
        },
        { onConflict: 'email' }
      );
    }

    const isSubAdminUnit =
      email.startsWith('lcd') ||
      email.startsWith('clb') ||
      email.startsWith('doi') ||
      isEventAdmin;

    // Smart role-based redirection
    if (isSuperAdmin) {
      return NextResponse.redirect(`${origin}/super-admin`);
    }
    if (
      email.includes('doanthanhnien') ||
      email.includes('ctsv') ||
      email.includes('quantri') ||
      email.includes('csvc')
    ) {
      return NextResponse.redirect(`${origin}/admin/proposals`);
    }
    if (isSubAdminUnit && !studentMssv) {
      return NextResponse.redirect(`${origin}/admin`);
    }
    if (isChecker && !studentMssv) {
      return NextResponse.redirect(`${origin}/scanner`);
    }

    return NextResponse.redirect(`${origin}/`);
  } catch (err) {
    console.error('Callback error:', err);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }
}
