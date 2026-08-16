import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { sanitizeInput } from '@/lib/security/sanitizer';
import {
  ROOT_SUPER_ADMIN,
  getStoredOfficerRoles,
  saveOfficerRole,
  removeOfficerRole,
  type OfficerRoleItem,
} from '@/lib/constants/officers-store';
import type { UserTier } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền xem danh sách cán bộ' }, { status: 403 });
    }

    const supabase = await createClient();
    const roles = await getStoredOfficerRoles(supabase);

    // Populate full_name from users table if missing
    let userMap = new Map<string, any>();
    try {
      const { data: allUsers } = await supabase.from('users').select('email, full_name, mssv, class_id');
      if (allUsers) {
        userMap = new Map((allUsers || []).map((u: any) => [u.email.toLowerCase(), u]));
      }
    } catch {}

    const enrichedRoles = roles.map((r) => {
      const u = userMap.get(r.email.toLowerCase());
      return {
        ...r,
        full_name: r.full_name || u?.full_name || r.email.split('@')[0],
        mssv: u?.mssv || '',
        class_id: u?.class_id || '',
        isRootAdmin: r.email.toLowerCase() === ROOT_SUPER_ADMIN,
      };
    });

    return NextResponse.json({ success: true, data: enrichedRoles });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền phân quyền cán bộ' }, { status: 403 });
    }

    const body = await req.json();
    const emailRaw = String(body.email || '').trim().toLowerCase();
    const roleTier = String(body.role_tier || '').trim() as UserTier;
    const unitCode = sanitizeInput(body.unit_code || 'BCH_DOAN');
    const unitName = sanitizeInput(body.unit_name || 'Đoàn TNCS Học Viện Cơ Sở TP.HCM');
    const fullNameInput = sanitizeInput(body.full_name || '');
    const notes = sanitizeInput(body.notes || '');

    if (!emailRaw || !emailRaw.includes('@')) {
      return NextResponse.json({ success: false, error: 'Email cán bộ không hợp lệ' }, { status: 400 });
    }

    // Validate domain
    const validDomains = ['@ptithcm.edu.vn', '@student.ptithcm.edu.vn', '@ptit.edu.vn', '@stu.ptit.edu.vn'];
    const isDomainValid = validDomains.some((d) => emailRaw.endsWith(d));
    if (!isDomainValid) {
      return NextResponse.json({
        success: false,
        error: 'Vui lòng chỉ phân quyền cho Email Học Viện (@ptithcm.edu.vn hoặc @student.ptithcm.edu.vn)',
      }, { status: 400 });
    }

    const validTiers: UserTier[] = ['super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin'];
    if (!validTiers.includes(roleTier)) {
      return NextResponse.json({ success: false, error: 'Vai trò cấp quyền không hợp lệ' }, { status: 400 });
    }

    const supabase = await createClient();

    // Look up user in users table for official name
    let dbUser: any = null;
    try {
      const res = await supabase
        .from('users')
        .select('full_name')
        .eq('email', emailRaw)
        .maybeSingle();
      dbUser = res?.data;
    } catch {
      try {
        const res = await supabase.from('users').select('full_name').eq('email', emailRaw);
        dbUser = Array.isArray(res?.data) ? res.data[0] : res?.data;
      } catch {}
    }

    const officialName = fullNameInput || dbUser?.full_name || emailRaw.split('@')[0];

    const newItem: OfficerRoleItem = {
      id: `off-${Date.now()}`,
      email: emailRaw,
      role_tier: roleTier,
      unit_code: unitCode,
      unit_name: unitName,
      full_name: officialName,
      notes: notes || `Cấp quyền bởi ${auth.email}`,
      created_by: auth.email,
      created_at: new Date().toISOString(),
    };

    await saveOfficerRole(newItem, supabase);

    // If role is super_admin, also sync to super_admins table
    if (roleTier === 'super_admin') {
      try {
        await supabase.from('super_admins').upsert({ email: emailRaw });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `Đã cấp quyền "${roleTier.toUpperCase()}" cho cán bộ ${officialName} (${emailRaw}) thành công!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền thu hồi vai trò' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const emailRaw = String(searchParams.get('email') || '').trim().toLowerCase();
    const roleTier = String(searchParams.get('role_tier') || '').trim();
    const id = searchParams.get('id') || undefined;

    if (!emailRaw) {
      return NextResponse.json({ success: false, error: 'Thiếu email cán bộ cần thu hồi quyền' }, { status: 400 });
    }

    // SECURITY RULE 1: Root admin immunity
    if (emailRaw === ROOT_SUPER_ADMIN) {
      return NextResponse.json({
        success: false,
        error: 'BẢO VỆ BẤT BIẾN: Không thể thu hồi quyền của Super Admin Gốc của hệ thống!',
      }, { status: 400 });
    }

    // SECURITY RULE 2: Self lockout prevention
    if (emailRaw === auth.email.toLowerCase() && (roleTier === 'super_admin' || !roleTier)) {
      return NextResponse.json({
        success: false,
        error: 'BẢO MẬT: Bạn không thể tự thu hồi quyền Super Admin của chính tài khoản bạn đang đăng nhập!',
      }, { status: 400 });
    }

    const supabase = await createClient();

    await removeOfficerRole(emailRaw, roleTier, id, supabase);

    // If revoked super_admin, also remove from super_admins table
    if (roleTier === 'super_admin' || !roleTier) {
      try {
        await supabase.from('super_admins').delete().ilike('email', emailRaw);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `Đã thu hồi quyền thành công của tài khoản ${emailRaw}!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
