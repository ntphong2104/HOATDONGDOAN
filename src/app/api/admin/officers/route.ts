import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { sanitizeInput } from '@/lib/security/sanitizer';
import type { UserTier } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ROOT_SUPER_ADMIN = 'n22dccn158@student.ptithcm.edu.vn';

export interface OfficerRoleItem {
  id: string;
  email: string;
  role_tier: UserTier;
  unit_code?: string;
  unit_name?: string;
  full_name?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

// Helper to fetch officer roles with fallback
export async function getStoredOfficerRoles(supabase: any): Promise<OfficerRoleItem[]> {
  try {
    const { data: tableData, error: tableErr } = await supabase
      .from('officer_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!tableErr && tableData) {
      return tableData.map((d: any) => ({
        id: String(d.id),
        email: d.email.toLowerCase(),
        role_tier: d.role_tier,
        unit_code: d.unit_code || 'BCH_DOAN',
        unit_name: d.unit_name || 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
        full_name: d.full_name || '',
        notes: d.notes || '',
        created_by: d.created_by || 'Super Admin',
        created_at: d.created_at || new Date().toISOString(),
      }));
    }
  } catch {}

  // Fallback: check system_settings
  try {
    const { data: settingData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'officer_roles')
      .maybeSingle();

    if (settingData?.value && Array.isArray(settingData.value)) {
      return settingData.value;
    }
  } catch {}

  // Default seed list
  return [
    {
      id: 'root-1',
      email: ROOT_SUPER_ADMIN,
      role_tier: 'super_admin',
      unit_code: 'BCH_DOAN',
      unit_name: 'Ban Quản Trị Toàn Trường',
      full_name: 'Nguyễn Thanh Phong',
      notes: 'Super Admin Gốc (Root Admin)',
      created_by: 'System',
      created_at: new Date().toISOString(),
    },
    {
      id: 'default-youth-union',
      email: 'doanthanhnien@ptithcm.edu.vn',
      role_tier: 'youth_union',
      unit_code: 'BCH_DOAN',
      unit_name: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
      full_name: 'Đoàn Thanh Niên Học Viện',
      notes: 'Tài khoản chức năng Đoàn Học Viện',
      created_by: 'System',
      created_at: new Date().toISOString(),
    },
    {
      id: 'default-ctsv',
      email: 'ctsv@ptithcm.edu.vn',
      role_tier: 'ctsv',
      unit_code: 'PHONG_CTSV',
      unit_name: 'Phòng Công Tác Sinh Viên (CTSV)',
      full_name: 'Phòng CTSV',
      notes: 'Tài khoản chức năng Phòng CTSV',
      created_by: 'System',
      created_at: new Date().toISOString(),
    },
    {
      id: 'default-csvc',
      email: 'quantri@ptithcm.edu.vn',
      role_tier: 'facility',
      unit_code: 'PHONG_CSVC',
      unit_name: 'Phòng Quản Trị CSVC & Tổ Chức',
      full_name: 'Phòng Quản Trị CSVC',
      notes: 'Tài khoản chức năng Phòng CSVC',
      created_by: 'System',
      created_at: new Date().toISOString(),
    },
  ];
}

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền xem danh sách cán bộ' }, { status: 403 });
    }

    const supabase = await createClient();
    const roles = await getStoredOfficerRoles(supabase);

    // Populate full_name from users table if missing
    const { data: allUsers } = await supabase.from('users').select('email, full_name, mssv, class_id');
    const userMap = new Map((allUsers || []).map((u: any) => [u.email.toLowerCase(), u]));

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

    // 1. Try inserting into officer_roles table
    let insertedInTable = false;
    try {
      const { data, error } = await supabase
        .from('officer_roles')
        .upsert({
          email: emailRaw,
          role_tier: roleTier,
          unit_code: unitCode,
          unit_name: unitName,
          full_name: officialName,
          notes: notes || `Cấp quyền bởi ${auth.email}`,
          created_by: auth.email,
          created_at: new Date().toISOString(),
        }, { onConflict: 'email,role_tier,unit_code' })
        .select()
        .single();

      if (!error && data) {
        insertedInTable = true;
      }
    } catch {}

    // 2. Also keep system_settings updated
    try {
      const existing = await getStoredOfficerRoles(supabase);
      const filtered = existing.filter((r) => !(r.email.toLowerCase() === emailRaw && r.role_tier === roleTier && r.unit_code === unitCode));
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
      const updatedList = [newItem, ...filtered];

      await supabase
        .from('system_settings')
        .upsert({
          key: 'officer_roles',
          value: updatedList,
          updated_at: new Date().toISOString(),
          updated_by: auth.email,
        }, { onConflict: 'key' });
    } catch {}

    // 3. If role is super_admin, also sync to super_admins table
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
    const id = searchParams.get('id');

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

    // 1. Delete from officer_roles table
    try {
      if (id && !id.startsWith('off-') && !id.startsWith('root-') && !id.startsWith('default-')) {
        await supabase.from('officer_roles').delete().eq('id', id);
      } else {
        let q = supabase.from('officer_roles').delete().ilike('email', emailRaw);
        if (roleTier) q = q.eq('role_tier', roleTier);
        await q;
      }
    } catch {}

    // 2. Delete from system_settings
    try {
      const existing = await getStoredOfficerRoles(supabase);
      const updatedList = existing.filter((r) => {
        if (id && r.id === id) return false;
        if (r.email.toLowerCase() === emailRaw) {
          if (roleTier && r.role_tier !== roleTier) return true;
          return false;
        }
        return true;
      });

      await supabase
        .from('system_settings')
        .upsert({
          key: 'officer_roles',
          value: updatedList,
          updated_at: new Date().toISOString(),
          updated_by: auth.email,
        }, { onConflict: 'key' });
    } catch {}

    // 3. If revoked super_admin, also remove from super_admins table
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
