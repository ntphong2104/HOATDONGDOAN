import { POST, DELETE, GET } from '@/app/api/admin/students/route';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/auth-helper');
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, resetInSeconds: 0 }),
}));

describe('Admin Students API (/api/admin/students)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/students', () => {
    it('rejects unauthorized or non-super-admin users', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);

      const req = new Request('http://localhost:3000/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssv: 'N21DCCN001', full_name: 'Nguyen Van A', class_id: 'D21CQCN01-N' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      // Non-super admin
      (getAuthContext as jest.Mock).mockResolvedValueOnce({
        email: 'user@ptithcm.edu.vn',
        isSuperAdmin: false,
        tier: 'user',
      });
      const res2 = await POST(req);
      expect(res2.status).toBe(403);
    });

    it('successfully adds a single student with auto-generated email', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({
        email: 'superadmin@ptithcm.edu.vn',
        isSuperAdmin: true,
        tier: 'super_admin',
      });

      const mockUpsert = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: [
            {
              mssv: 'N21DCCN001',
              full_name: 'Nguyen Van A',
              class_id: 'D21CQCN01-N',
              email: 'n21dccn001@student.ptithcm.edu.vn',
            },
          ],
          error: null,
        }),
      });

      (createClient as jest.Mock).mockResolvedValueOnce({
        from: jest.fn().mockReturnValue({
          upsert: mockUpsert,
        }),
      });

      const req = new Request('http://localhost:3000/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv: 'N21DCCN001',
          full_name: 'Nguyen Van A',
          class_id: 'D21CQCN01-N',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(1);

      // Verify mock upsert received auto-generated email
      expect(mockUpsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            mssv: 'N21DCCN001',
            full_name: 'Nguyen Van A',
            class_id: 'D21CQCN01-N',
            email: 'n21dccn001@student.ptithcm.edu.vn',
          }),
        ],
        { onConflict: 'mssv' }
      );
    });

    it('successfully adds multiple students via table array', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({
        email: 'superadmin@ptithcm.edu.vn',
        isSuperAdmin: true,
        tier: 'super_admin',
      });

      const mockUpsert = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: [{ mssv: 'N21DCCN001' }, { mssv: 'N21DCCN002' }],
          error: null,
        }),
      });

      (createClient as jest.Mock).mockResolvedValueOnce({
        from: jest.fn().mockReturnValue({
          upsert: mockUpsert,
        }),
      });

      const req = new Request('http://localhost:3000/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: [
            { mssv: 'n21dccn001', full_name: 'Nguyen Van A', class_id: 'd21cqcn01-n' },
            { mssv: 'n21dccn002', full_name: 'Tran Thi B', class_id: 'd21cqcn01-n' },
            { mssv: '', full_name: '', class_id: '' }, // empty row should be skipped
          ],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);

      // Verify uppercase normalization
      expect(mockUpsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({ mssv: 'N21DCCN001', class_id: 'D21CQCN01-N' }),
          expect.objectContaining({ mssv: 'N21DCCN002', class_id: 'D21CQCN01-N' }),
        ],
        { onConflict: 'mssv' }
      );
    });

    it('rejects invalid MSSV format', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({
        email: 'superadmin@ptithcm.edu.vn',
        isSuperAdmin: true,
        tier: 'super_admin',
      });

      const req = new Request('http://localhost:3000/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv: '123456', // Invalid MSSV
          full_name: 'Nguyen Van A',
          class_id: 'D21CQCN01-N',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('không đúng định dạng');
    });
  });

  describe('DELETE /api/admin/students', () => {
    it('deletes student successfully by MSSV query param', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({
        email: 'superadmin@ptithcm.edu.vn',
        isSuperAdmin: true,
        tier: 'super_admin',
      });

      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      (createClient as jest.Mock).mockResolvedValueOnce({
        from: jest.fn().mockReturnValue({
          delete: mockDelete,
        }),
      });

      const req = new Request('http://localhost:3000/api/admin/students?mssv=N21DCCN001', {
        method: 'DELETE',
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('Đã xóa sinh viên N21DCCN001');
    });
  });
});
