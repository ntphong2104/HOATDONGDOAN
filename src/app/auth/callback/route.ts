import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isValidSchoolEmail, extractMSSV } from '@/lib/utils/extract-mssv';
import { getOfficialTierForEmail } from '@/lib/auth/official-roles';
import { getStoredOfficerRoles } from '@/lib/constants/officers-store';
import { sanitizeRedirectPath, getTrustedOrigin } from '@/lib/security/redirect';
import { sanitizePostgrestValue } from '@/lib/security/sanitizer';
import {
  isPlaceholderName,
  isPlaceholderClass,
  parseGoogleStudentName,
  normalizeStudentFullName,
  normalizeStudentClassId,
  getMasterStudentByMssv,
} from '@/lib/utils/student-profile';

function getPublicOrigin(request: Request): string {
  return getTrustedOrigin(request);
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
    const studentMssv = extractMSSV(email);
    const adminSupabase = (typeof createAdminClient === 'function' ? await createAdminClient() : supabase) || supabase;

    // Run all auth checks in parallel (using B-tree indexes via .eq instead of .ilike)
    const [superAdminResult, existingUser, eventRolesResult] = await Promise.all([
      // 1. Check super admin
      (async () => {
        try {
          const res = await adminSupabase
            .from('super_admins')
            .select('email')
            .eq('email', email)
            .maybeSingle();
          return res.data;
        } catch { return null; }
      })(),
      // 2. Check registered student or unit in users table (single query reused for upsert decision)
      (async () => {
        try {
          const safeEmail = sanitizePostgrestValue(email, 120);
          const safeMssv = studentMssv ? sanitizePostgrestValue(studentMssv, 30) : '';
          const q = adminSupabase
            .from('users')
            .select('mssv, email, full_name, class_id');
          const res = safeMssv
            ? await q.or(`email.eq.${safeEmail},mssv.eq.${safeMssv}`).maybeSingle()
            : await q.eq('email', email).maybeSingle();
          return res.data;
        } catch { return null; }
      })(),
      // 3. Check event role
      (async () => {
        try {
          const res = await adminSupabase
            .from('event_roles')
            .select('role_type')
            .eq('email', email);
          return res.data || [];
        } catch { return []; }
      })(),
    ]);

    const superAdmin = superAdminResult;
    const registeredUser = existingUser;
    const eventRoles = eventRolesResult;

    const isSuperAdmin = !!superAdmin || email === 'n22dccn158@student.ptithcm.edu.vn';
    const isEventAdmin = eventRoles?.some((r) => r.role_type === 'event_admin');
    const isChecker = eventRoles?.some((r) => r.role_type === 'checker');

    const isAuthorized = isSuperAdmin || !!registeredUser || (eventRoles && eventRoles.length > 0) || isValidSchoolEmail(email);

    if (!isAuthorized) {
      try {
        if (session.user.id && adminSupabase) {
          await adminSupabase.auth.admin.deleteUser(session.user.id);
        }
      } catch {}
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=invalid_domain`);
    }

    // Check or auto-register student user in users table ONLY when missing or placeholder fields need healing
    if (studentMssv) {
      try {
        const rawName =
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          '';

        const masterRecord = getMasterStudentByMssv(studentMssv);
        const parsedGoogle = parseGoogleStudentName(rawName);
        const googleName = normalizeStudentFullName(parsedGoogle.full_name);
        const googleClass = normalizeStudentClassId(parsedGoogle.class_id);

        const className = !isPlaceholderClass(existingUser?.class_id)
          ? existingUser!.class_id
          : (masterRecord?.class_id || googleClass || 'PTIT-HCM');
        const actualName = !isPlaceholderName(existingUser?.full_name, studentMssv)
          ? existingUser!.full_name
          : (masterRecord?.full_name || googleName || existingUser?.full_name || studentMssv);

        const needsUpsert =
          !existingUser ||
          existingUser.full_name !== actualName ||
          existingUser.class_id !== className ||
          (existingUser.email || '').toLowerCase() !== email;

        if (needsUpsert) {
          await adminSupabase.from('users').upsert(
            {
              mssv: studentMssv,
              email,
              full_name: actualName,
              class_id: className,
            },
            { onConflict: 'mssv' }
          );
        }
      } catch (upsertErr) {
        console.error('Student upsert error:', upsertErr);
      }
    }

    // If a specific target page was requested (e.g. /events/[id]/register)
    const rawNext = searchParams.get('next') || searchParams.get('redirect');
    const safeNext = sanitizeRedirectPath(rawNext, '');
    if (safeNext) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }

    // Super Admin mặc định vào thẳng Tổng quan Điều hành (/super-admin)
    if (isSuperAdmin) {
      return NextResponse.redirect(`${origin}/super-admin`);
    }

    // Tài khoản sinh viên (có MSSV) mặc định vào Tổng quan cá nhân (/)
    if (studentMssv) {
      return NextResponse.redirect(`${origin}/`);
    }

    // Tài khoản đơn vị / phòng ban (không có MSSV) vào thẳng Bàn làm việc tương ứng
    let departmentTier: string | null = getOfficialTierForEmail(email);
    if (!departmentTier) {
      try {
        const stored = await getStoredOfficerRoles(await createAdminClient());
        departmentTier = stored.find((o) => o.email.toLowerCase().trim() === email)?.role_tier || null;
      } catch {}
    }
    if (departmentTier === 'ctsv' || departmentTier === 'facility') {
      return NextResponse.redirect(`${origin}/admin/proposals`);
    }
    if (departmentTier === 'security') {
      return NextResponse.redirect(`${origin}/security`);
    }
    if (isChecker && !isEventAdmin) {
      return NextResponse.redirect(`${origin}/scanner`);
    }
    return NextResponse.redirect(`${origin}/admin`);
  } catch (err) {
    console.error('Callback error:', err);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }
}
