import { GET, POST, DELETE } from '@/app/api/admin/officers/route';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { createClient, createAdminClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/auth-helper', () => ({
  getAuthContext: jest.fn(),
  invalidateAuthContextCache: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

describe('Whitebox Tests: /api/admin/officers (Role Management & Security Rules)', () => {
  let mockSupabase: any;
  let mockOfficersList: any[];
  let mockSuperAdminsList: any[];
  let superAdminsUpsertSpy: jest.Mock;
  let superAdminsDeleteIlikeSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSuperAdminsList = [];
    superAdminsUpsertSpy = jest.fn().mockResolvedValue({ data: null, error: null });
    superAdminsDeleteIlikeSpy = jest.fn().mockResolvedValue({ data: null, error: null });
    mockOfficersList = [
      {
        id: '1',
        email: 'n22dccn158@student.ptithcm.edu.vn',
        role_tier: 'super_admin',
        unit_code: 'BCH_DOAN',
        unit_name: 'Ban Quản Trị Toàn Trường',
        full_name: 'Nguyễn Thanh Phong',
        notes: 'Root Admin',
        created_by: 'System',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        email: 'canbo1@ptithcm.edu.vn',
        role_tier: 'youth_union',
        unit_code: 'BCH_DOAN',
        unit_name: 'Đoàn TNCS Học Viện',
        full_name: 'Trần Văn B',
        notes: 'Phó Bí thư',
        created_by: 'n22dccn158@student.ptithcm.edu.vn',
        created_at: new Date().toISOString(),
      },
    ];

    mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'officer_roles') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: mockOfficersList, error: null }),
            upsert: jest.fn().mockImplementation((item) => ({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: '3', ...item }, error: null }),
            })),
            delete: jest.fn().mockImplementation(() => ({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              ilike: jest.fn().mockReturnThis(),
            })),
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnValue({
              ilike: jest.fn().mockResolvedValue({ data: null, error: null }),
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
            then: jest.fn((resolve: any) =>
              resolve({
                data: [
                  { email: 'n22dccn158@student.ptithcm.edu.vn', full_name: 'Nguyễn Thanh Phong', mssv: 'N22DCCN158', class_id: 'D22CQCN01-N' },
                ],
                error: null,
              })
            ),
          };
        }
        if (table === 'system_settings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { value: mockOfficersList }, error: null }),
            upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'super_admins') {
          return {
            select: jest.fn().mockImplementation(() =>
              Promise.resolve({ data: mockSuperAdminsList, error: null })
            ),
            upsert: superAdminsUpsertSpy,
            delete: jest.fn().mockReturnValue({
              ilike: superAdminsDeleteIlikeSpy,
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };

    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  test('Security Rule 1: Non-Super-Admin is rejected with 403', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'student@student.ptithcm.edu.vn',
      isSuperAdmin: false,
      tier: 'user',
    });

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('Security Rule 2: Non-school email domain is rejected with 400', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'n22dccn158@student.ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });

    const req = new Request('http://localhost/api/admin/officers', {
      method: 'POST',
      body: JSON.stringify({
        email: 'hacker@gmail.com',
        role_tier: 'youth_union',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Email Học Viện');
  });

  test('Security Rule 3: Root Admin Immunity - Cannot revoke root admin', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'subadmin@ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });

    const req = new Request('http://localhost/api/admin/officers?email=n22dccn158@student.ptithcm.edu.vn&role_tier=super_admin', {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('BẢO VỆ BẤT BIẾN');
  });

  test('Security Rule 4: Self-Lockout Prevention - Cannot revoke self super admin role', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'myadmin@ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });

    const req = new Request('http://localhost/api/admin/officers?email=myadmin@ptithcm.edu.vn&role_tier=super_admin', {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('không thể tự thu hồi quyền');
  });

  test('Happy Path: Super Admin can grant role to valid school officer', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'n22dccn158@student.ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });

    const req = new Request('http://localhost/api/admin/officers', {
      method: 'POST',
      body: JSON.stringify({
        email: 'doanthanhnien2@student.ptithcm.edu.vn',
        full_name: 'Lê Văn C',
        role_tier: 'youth_union',
        unit_code: 'BCH_DOAN',
        unit_name: 'Đoàn Học Viện',
        notes: 'Ủy viên BCH Đoàn trường',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('Đã cấp quyền');
  });

  test('Granting office_admin does NOT upsert super_admins and cleans stale super_admins rows', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'n22dccn158@student.ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });

    const req = new Request('http://localhost/api/admin/officers', {
      method: 'POST',
      body: JSON.stringify({
        email: 'n23dcvt109@student.ptithcm.edu.vn',
        full_name: 'VÕ VĂN LUẬT',
        role_tier: 'office_admin',
        unit_code: 'VAN_PHONG_DOAN',
        unit_name: 'Văn phòng Đoàn (Trực VP & Mượn dụng cụ)',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(superAdminsUpsertSpy).not.toHaveBeenCalled();
    expect(superAdminsDeleteIlikeSpy).toHaveBeenCalledWith('email', 'n23dcvt109@student.ptithcm.edu.vn');
  });

  test('GET auto-heals stale super_admins rows for non-super_admin officers and hides fake super_admin badge', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'n22dccn158@student.ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });
    mockSuperAdminsList = [
      { email: 'canbo1@ptithcm.edu.vn', created_at: '2026-08-19T00:00:00.000Z' },
    ];

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(superAdminsDeleteIlikeSpy).toHaveBeenCalledWith('email', 'canbo1@ptithcm.edu.vn');
    const leakedSuperAdmin = body.data.find(
      (o: any) => o.email === 'canbo1@ptithcm.edu.vn' && o.role_tier === 'super_admin'
    );
    expect(leakedSuperAdmin).toBeUndefined();
  });
});
