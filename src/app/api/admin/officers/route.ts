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
    const officerMap = new Map<string, OfficerRoleItem>();

    const makeKey = (email: string, tier: string, unit: string = '') =>
      `${email.toLowerCase().trim()}-${tier.trim()}-${(unit || '').trim()}`;

    // 1. Always seed Root Super Admin with standard key
    const rootKey = makeKey(ROOT_SUPER_ADMIN, 'super_admin', 'BCH_DOAN');
    officerMap.set(rootKey, {
      id: 'root-1',
      email: ROOT_SUPER_ADMIN,
      role_tier: 'super_admin',
      unit_code: 'BCH_DOAN',
      unit_name: 'Ban Quản Trị Toàn Trường',
      full_name: 'Nguyễn Thanh Phong',
      notes: 'Super Admin Gốc (Root Admin)',
      created_by: 'System',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    // 2. Fetch Stored Officer Roles
    try {
      const stored = await getStoredOfficerRoles(supabase);
      for (const r of stored) {
        const key = makeKey(r.email, r.role_tier, r.unit_code || 'BCH_DOAN');
        if (r.email.toLowerCase() === ROOT_SUPER_ADMIN.toLowerCase()) {
          officerMap.set(rootKey, {
            ...officerMap.get(rootKey)!,
            ...r,
            id: 'root-1',
            email: ROOT_SUPER_ADMIN,
            role_tier: 'super_admin',
            unit_code: 'BCH_DOAN',
            unit_name: 'Ban Quản Trị Toàn Trường',
            full_name: 'Nguyễn Thanh Phong',
            notes: 'Super Admin Gốc (Root Admin)',
          });
        } else if (!officerMap.has(key)) {
          officerMap.set(key, r);
        }
      }
    } catch (e) {
      console.warn('Failed to load stored officer roles:', e);
    }

    // 3. Fetch from super_admins table
    try {
      const { data: superAdmins } = await supabase.from('super_admins').select('email, created_at');
      if (superAdmins) {
        for (const sa of superAdmins) {
          const emailLower = sa.email.toLowerCase().trim();
          if (emailLower === ROOT_SUPER_ADMIN.toLowerCase()) continue; // already seeded
          const key = makeKey(emailLower, 'super_admin', 'BCH_DOAN');
          if (!officerMap.has(key)) {
            officerMap.set(key, {
              id: `sa-${emailLower}`,
              email: emailLower,
              role_tier: 'super_admin',
              unit_code: 'BCH_DOAN',
              unit_name: 'Ban Quản Trị Toàn Trường',
              full_name: emailLower.split('@')[0],
              notes: 'Super Admin Hệ Thống',
              created_by: 'Super Admin',
              created_at: sa.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch {}

    // 4. Fetch from event_roles table (Admins / Checkers của các sự kiện)
    try {
      const { data: eventRoles } = await supabase
        .from('event_roles')
        .select('id, email, role_type, created_at, event_id, events(event_name)');
      if (eventRoles) {
        for (const er of eventRoles) {
          const emailLower = er.email.toLowerCase().trim();
          const roleTier: UserTier = 'event_admin';
          const eventName = (er.events as any)?.event_name || `Sự kiện #${er.event_id}`;
          const key = makeKey(emailLower, roleTier, `event-${er.event_id}`);
          if (!officerMap.has(key)) {
            officerMap.set(key, {
              id: String(er.id || `er-${emailLower}-${er.event_id}`),
              email: emailLower,
              role_tier: roleTier,
              unit_code: 'LCD_CLB',
              unit_name: eventName,
              full_name: emailLower.split('@')[0],
              notes: er.role_type === 'event_admin' ? `Admin sự kiện: ${eventName}` : `CTV quét mã sự kiện: ${eventName}`,
              created_by: 'Ban Tổ Chức',
              created_at: er.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch {}

    // 5. Populate user profile details (full_name, mssv, class_id)
    let userMap = new Map<string, any>();
    try {
      const { data: allUsers } = await supabase.from('users').select('email, full_name, mssv, class_id, tier');
      if (allUsers) {
        userMap = new Map(allUsers.map((u: any) => [u.email.toLowerCase().trim(), u]));

        // Check if any users have elevated tier in users table
        for (const u of allUsers) {
          if (u.tier && u.tier !== 'user') {
            const emailLower = u.email.toLowerCase().trim();
            if (emailLower === ROOT_SUPER_ADMIN.toLowerCase()) continue;
            const key = makeKey(emailLower, u.tier, 'BCH_DOAN');
            if (!Array.from(officerMap.values()).some((o) => o.email.toLowerCase().trim() === emailLower && o.role_tier === u.tier)) {
              officerMap.set(key, {
                id: `user-${emailLower}-${u.tier}`,
                email: emailLower,
                role_tier: u.tier,
                unit_code: u.tier === 'super_admin' ? 'BCH_DOAN' : 'BCH_DOAN',
                unit_name: u.tier === 'super_admin' ? 'Ban Quản Trị Toàn Trường' : 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
                full_name: u.full_name || emailLower.split('@')[0],
                notes: `Phân quyền cấp ${u.tier.toUpperCase()}`,
                created_by: 'Hệ Thống',
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch {}

    const allOfficers = Array.from(officerMap.values()).map((r) => {
      const u = userMap.get(r.email.toLowerCase().trim());
      return {
        ...r,
        full_name: r.full_name || u?.full_name || r.email.split('@')[0],
        mssv: u?.mssv || '',
        class_id: u?.class_id || '',
        isRootAdmin: r.email.toLowerCase().trim() === ROOT_SUPER_ADMIN.toLowerCase(),
      };
    });

    // Sort: Root Super Admin first, then Super Admins, then newer officers
    allOfficers.sort((a, b) => {
      if (a.isRootAdmin) return -1;
      if (b.isRootAdmin) return 1;
      if (a.role_tier === 'super_admin' && b.role_tier !== 'super_admin') return -1;
      if (b.role_tier === 'super_admin' && a.role_tier !== 'super_admin') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ success: true, data: allOfficers });
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

    // 1. Save to persistent officer store
    await saveOfficerRole(newItem, supabase);

    // 2. If super_admin or youth_union, sync to super_admins table for full database access
    if (roleTier === 'super_admin' || roleTier === 'youth_union') {
      try {
        await supabase.from('super_admins').upsert({ email: emailRaw }, { onConflict: 'email' });
      } catch {}
    }

    // 3. Update users table tier so the user immediately has the new permissions
    try {
      await supabase.from('users').update({ tier: roleTier }).eq('email', emailRaw);
    } catch {}

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

    // 1. Remove from stored officer roles
    await removeOfficerRole(emailRaw, roleTier, id, supabase);

    // 2. If revoked super_admin, remove from super_admins table
    if (roleTier === 'super_admin' || !roleTier) {
      try {
        await supabase.from('super_admins').delete().ilike('email', emailRaw);
      } catch {}
    }

    // 3. If event_admin, remove from event_roles table if matching id
    if (id && !id.startsWith('off-') && !id.startsWith('sa-') && !id.startsWith('user-')) {
      try {
        await supabase.from('event_roles').delete().eq('id', id);
      } catch {}
    } else {
      try {
        await supabase.from('event_roles').delete().ilike('email', emailRaw);
      } catch {}
    }

    // 4. Reset user tier to 'user' in users table if no other officer role remains
    try {
      await supabase.from('users').update({ tier: 'user' }).eq('email', emailRaw);
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Đã thu hồi quyền thành công của tài khoản ${emailRaw}!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
