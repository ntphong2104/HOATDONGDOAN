import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isValidSchoolEmail, extractMSSV } from '@/lib/utils/extract-mssv';

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

      let className = (existingUser?.class_id && existingUser.class_id !== 'PTIT-HCM') ? existingUser.class_id : 'PTIT-HCM';
      let actualName = (existingUser?.full_name && !existingUser.full_name.includes('@'))
        ? existingUser.full_name
        : (rawName || studentMssv);

      // PTIT Google account name format: "D22CQCN02-N NGUYEN THANH PHONG"
      const match = rawName.match(/^([A-Z]\d{2}[A-Z0-9-]+)\s+(.+)$/i);
      if (match) {
        if (!existingUser?.class_id || existingUser.class_id === 'PTIT-HCM') {
          className = match[1].toUpperCase();
        }
        if (!existingUser?.full_name || existingUser.full_name.includes('@')) {
          actualName = match[2].trim();
        }
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
      email.includes('marketing') ||
      email.includes('ketoan') ||
      email.includes('quantri') ||
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
    if (
      email.includes('doanthanhnien') ||
      email.includes('ctsv') ||
      email.includes('quantri') ||
      email.includes('tchc') ||
      email.includes('tchcqt') ||
      email.includes('csvc')
    ) {
      return NextResponse.redirect(`${origin}/admin/proposals`);
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
