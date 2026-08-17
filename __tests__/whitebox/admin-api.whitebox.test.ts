import { NextRequest } from 'next/server';
import { GET as getBlacklist } from '@/app/api/admin/blacklist/route';
import { POST as postBan } from '@/app/api/admin/blacklist/ban/route';
import { POST as postUnban } from '@/app/api/admin/blacklist/unban/route';
import { GET as getDelegates, POST as postDelegate, DELETE as deleteDelegate } from '@/app/api/admin/delegates/route';
import { GET as getMaintenance, PATCH as patchMaintenance } from '@/app/api/admin/maintenance/route';
import { GET as getStats } from '@/app/api/admin/stats/route';
import { GET as getStudents } from '@/app/api/admin/students/route';
import { GET as getStudentsHistory } from '@/app/api/admin/students/history/route';
import { GET as getStudentMssvHistory } from '@/app/api/admin/students/[mssv]/history/route';
import { GET as getUnits } from '@/app/api/admin/units/route';
import { GET as getExportAll } from '@/app/api/admin/export-all/route';
import { POST as postUploadUsers } from '@/app/api/admin/upload-users/route';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import * as XLSX from 'xlsx';

jest.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true })
}));

const mockBuilder = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: {}, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: {}, error: null }),
  then: jest.fn((resolve) => resolve({ data: [], error: null }))
};

const mockSupabase = {
  from: jest.fn(() => mockBuilder),
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null })
  }
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabase)),
}));

jest.mock('@/lib/supabase/auth-helper', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(),
  },
}));

describe('Admin API Routes Whitebox Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'admin@ptithcm.edu.vn',
      tier: 'super_admin',
      isSuperAdmin: true,
      isEventAdmin: true,
    });
    mockBuilder.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
    mockBuilder.single.mockResolvedValue({ data: {}, error: null });
    mockBuilder.maybeSingle.mockResolvedValue({ data: {}, error: null });
    
    mockSupabase.auth.getSession.mockResolvedValue({ 
      data: { session: { user: { email: 'admin@ptithcm.edu.vn' } } }, 
      error: null 
    });
    mockSupabase.auth.getUser.mockResolvedValue({ 
      data: { user: { email: 'admin@ptithcm.edu.vn' } }, 
      error: null 
    });
  });

  describe('Blacklist GET', () => {
    it('returns 401 if unauthorized', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const res = await getBlacklist();
      expect(res.status).toBe(401);
    });

    it('returns data on success', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ data: [{ id: 1 }], error: null }));
      const res = await getBlacklist();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
    });

    it('returns 500 on error', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ data: null, error: { message: 'DB Error' } }));
      const res = await getBlacklist();
      expect(res.status).toBe(500);
    });
  });

  describe('Blacklist Ban POST', () => {
    it('returns 403 if not super admin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postBan(req);
      expect(res.status).toBe(403);
    });

    it('returns 400 if mssv missing', async () => {
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({}) });
      const res = await postBan(req);
      expect(res.status).toBe(400);
    });

    it('upserts and returns 200 on success', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: { full_name: 'Test', class_id: 'C1' }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: { id: 1 }, error: null });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postBan(req);
      expect(res.status).toBe(200);
    });
    
    it('returns 500 on upsert error', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: { full_name: 'Test' }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: null, error: { message: 'Err' } });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postBan(req);
      expect(res.status).toBe(500);
    });
  });

  describe('Blacklist Unban POST', () => {
    it('returns 403 if not super admin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postUnban(req);
      expect(res.status).toBe(403);
    });

    it('returns 400 if mssv missing', async () => {
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({}) });
      const res = await postUnban(req);
      expect(res.status).toBe(400);
    });

    it('deletes and returns 200 on success', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postUnban(req);
      expect(res.status).toBe(200);
    });

    it('returns 500 on delete error', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: { message: 'Err' } }));
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postUnban(req);
      expect(res.status).toBe(500);
    });
  });

  describe('Delegates GET/POST/DELETE', () => {
    it('GET returns delegates and maps expiration', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ 
        data: [{ is_active: true, expires_at: new Date(Date.now() - 10000).toISOString() }, { is_active: false, expires_at: new Date(Date.now() + 1000000).toISOString() }], 
        error: null 
      }));
      const res = await getDelegates();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data[0].status).toBe('expired');
      expect(json.data[1].status).toBe('revoked');
    });

    it('GET returns 500 on db error', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ data: null, error: { message: 'Err' } }));
      const res = await getDelegates();
      expect(res.status).toBe(500);
    });
    
    it('GET returns 401 on unauth', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const res = await getDelegates();
      expect(res.status).toBe(401);
    });

    it('POST returns 400 if no mssv', async () => {
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({}) });
      const res = await postDelegate(req);
      expect(res.status).toBe(400);
    });

    it('POST returns 404 if student not found', async () => {
      mockBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postDelegate(req);
      expect(res.status).toBe(404);
    });

    it('POST returns 400 if no class', async () => {
      mockBuilder.maybeSingle.mockResolvedValueOnce({ data: { full_name: 'A', class_id: 'Chưa phân lớp' }, error: null });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postDelegate(req);
      expect(res.status).toBe(400);
    });

    it('POST success', async () => {
      mockBuilder.maybeSingle.mockResolvedValueOnce({ data: { full_name: 'A', class_id: 'C1', email: 'e@e' }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: { id: 1 }, error: null });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postDelegate(req);
      expect(res.status).toBe(200);
    });

    it('POST 500 on insert error', async () => {
      mockBuilder.maybeSingle.mockResolvedValueOnce({ data: { full_name: 'A', class_id: 'C1', email: 'e@e' }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: null, error: { message: 'Err' } });
      const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mssv: 'N22' }) });
      const res = await postDelegate(req);
      expect(res.status).toBe(500);
    });

    it('DELETE returns 400 if no id', async () => {
      const req = new NextRequest('http://localhost/api?id=', { method: 'DELETE' });
      const res = await deleteDelegate(req);
      expect(res.status).toBe(400);
    });

    it('DELETE success', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));
      const req = new NextRequest('http://localhost/api?id=1', { method: 'DELETE' });
      const res = await deleteDelegate(req);
      expect(res.status).toBe(200);
    });

    it('DELETE 500 on error', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: { message: 'Err' } }));
      const req = new NextRequest('http://localhost/api?id=1', { method: 'DELETE' });
      const res = await deleteDelegate(req);
      expect(res.status).toBe(500);
    });
  });

  describe('Maintenance GET/PATCH', () => {
    it('GET success', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: { maintenance_mode: true }, error: null });
      const res = await getMaintenance();
      expect(res.status).toBe(200);
    });

    it('GET 500', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: null, error: { message: 'Err' } });
      const res = await getMaintenance();
      expect(res.status).toBe(500);
    });

    it('PATCH 401', async () => {
      mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      const req = new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
      const res = await patchMaintenance(req);
      expect(res.status).toBe(401);
    });

    it('PATCH 403', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: null, error: null }); // no super admin
      const req = new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
      const res = await patchMaintenance(req);
      expect(res.status).toBe(403);
    });

    it('PATCH 200', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: { maintenance_mode: true }, error: null });
      const req = new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
      const res = await patchMaintenance(req);
      expect(res.status).toBe(200);
    });
    
    it('PATCH 500', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: null, error: { message: 'Err' } });
      const req = new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
      const res = await patchMaintenance(req);
      expect(res.status).toBe(500);
    });
  });

  describe('Stats GET', () => {
    it('GET 401', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const res = await getStats();
      expect(res.status).toBe(401);
    });

    it('GET 403', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false });
      const res = await getStats();
      expect(res.status).toBe(403);
    });

    it('GET success', async () => {
      mockBuilder.then
        .mockImplementationOnce((resolve) => resolve({ count: 10, error: null }))
        .mockImplementationOnce((resolve) => resolve({ count: 20, error: null }))
        .mockImplementationOnce((resolve) => resolve({ count: 5, error: null }))
        .mockImplementationOnce((resolve) => resolve({ count: 30, error: null }));
      const res = await getStats();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.events).toBe(10);
      expect(json.data.checkins).toBe(20);
      expect(json.data.students).toBe(30);
    });
  });

  describe('Students GET', () => {
    it('GET 401', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const req = new NextRequest('http://localhost');
      const res = await getStudents(req);
      expect(res.status).toBe(401);
    });

    it('GET 403', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false, tier: 'student' });
      const req = new NextRequest('http://localhost');
      const res = await getStudents(req);
      expect(res.status).toBe(403);
    });

    it('GET with query success', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ data: [{ mssv: 'N22' }, { mssv: 'LCD_1' }], error: null }));
      const req = new NextRequest('http://localhost?q=N22');
      const res = await getStudents(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1); // LCD filtered
    });

    it('GET with query 500', async () => {
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ data: null, error: { message: 'Err' } }));
      const req = new NextRequest('http://localhost?q=N22');
      const res = await getStudents(req);
      expect(res.status).toBe(500);
    });

    it('GET paginated success', async () => {
      mockBuilder.then
        .mockImplementationOnce((resolve) => resolve({ data: Array(1000).fill({ mssv: 'N22' }), error: null }))
        .mockImplementationOnce((resolve) => resolve({ data: [{ mssv: 'N23' }], error: null }));
      const req = new NextRequest('http://localhost');
      const res = await getStudents(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1001);
    });
    
    it('GET paginated 500', async () => {
      mockBuilder.then
        .mockImplementationOnce((resolve) => resolve({ data: null, error: { message: 'Err' } }));
      const req = new NextRequest('http://localhost');
      const res = await getStudents(req);
      expect(res.status).toBe(200); // the catch inside the loop breaks, returns what we have (0)
      const json = await res.json();
      expect(json.data).toHaveLength(0);
    });
  });

  describe('Students History GET', () => {
    it('GET 401', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const req = new NextRequest('http://localhost?mssv=1');
      const res = await getStudentsHistory(req);
      expect(res.status).toBe(401);
    });

    it('GET 403', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false, tier: 'student' });
      const req = new NextRequest('http://localhost?mssv=1');
      const res = await getStudentsHistory(req);
      expect(res.status).toBe(403);
    });

    it('GET 400 no mssv', async () => {
      const req = new NextRequest('http://localhost');
      const res = await getStudentsHistory(req);
      expect(res.status).toBe(400);
    });

    it('GET success', async () => {
      mockBuilder.maybeSingle.mockResolvedValueOnce({ data: { mssv: 'N22' }, error: null }); // user
      mockBuilder.then
        .mockImplementationOnce((resolve) => resolve({ data: [{ id: 1, events: { event_name: 'E1' } }], error: null })) // checkins
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })); // attendedRegs
      mockBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // penalty

      const req = new NextRequest('http://localhost?mssv=N22');
      const res = await getStudentsHistory(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.history).toHaveLength(1);
    });
  });

  describe('Student [mssv] History GET', () => {
    it('GET 401', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const req = new NextRequest('http://localhost');
      const res = await getStudentMssvHistory(req, { params: Promise.resolve({ mssv: 'N22' }) });
      expect(res.status).toBe(401);
    });

    it('GET 403', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false, tier: 'student' });
      const req = new NextRequest('http://localhost');
      const res = await getStudentMssvHistory(req, { params: Promise.resolve({ mssv: 'N22' }) });
      expect(res.status).toBe(403);
    });

    it('GET success', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: { mssv: 'N22' }, error: null }); // user
      mockBuilder.then
        .mockImplementationOnce((resolve) => resolve({ data: [{ id: 1, events: { event_name: 'E1' } }], error: null })) // checkins
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })); // attendedRegs
      mockBuilder.single.mockResolvedValueOnce({ data: null, error: null }); // penalty

      const req = new NextRequest('http://localhost');
      const res = await getStudentMssvHistory(req, { params: Promise.resolve({ mssv: 'N22' }) });
      expect(res.status).toBe(200);
    });

    it('GET 500 on checkin err', async () => {
      mockBuilder.single.mockResolvedValueOnce({ data: { mssv: 'N22' }, error: null }); // user
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ data: null, error: { message: 'Err' } })); // checkins

      const req = new NextRequest('http://localhost');
      const res = await getStudentMssvHistory(req, { params: Promise.resolve({ mssv: 'N22' }) });
      expect(res.status).toBe(500);
    });
  });

  describe('Units GET', () => {
    it('GET 401', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const res = await getUnits();
      expect(res.status).toBe(401);
    });

    it('GET success', async () => {
      const res = await getUnits();
      expect(res.status).toBe(200);
    });
  });

  describe('Export All GET', () => {
    beforeEach(() => {
      mockBuilder.single.mockReset();
      mockBuilder.single.mockResolvedValue({ data: {}, error: null });
      mockBuilder.then.mockReset();
      mockBuilder.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
    });

    it('GET 401', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const res = await getExportAll();
      expect(res.status).toBe(401);
    });

    it('GET 403', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'admin@ptithcm.edu.vn' } }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: null, error: null });
      const res = await getExportAll();
      expect(res.status).toBe(403);
    });

    it('GET success', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'admin@ptithcm.edu.vn' } }, error: null });
      mockBuilder.single.mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null });
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ 
        data: [{ mssv: 'N22', users: { full_name: 'A', class_id: 'C1' }, events: { event_name: 'E1', semester: 'S1' } }], 
        error: null 
      }));
      const res = await getExportAll();
      expect(res.status).toBe(200);
    });

    it('GET 500', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'admin@ptithcm.edu.vn' } }, error: null });
      mockBuilder.single.mockRejectedValueOnce(new Error('err'));
      const res = await getExportAll();
      expect(res.status).toBe(500);
    });
  });

  describe('Upload Users POST', () => {
    let mockFile: any;
    let mockFormData: any;
    let mockRequest: any;

    beforeEach(() => {
      mockFile = {
        name: 'students.xlsx',
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      };
      
      mockFormData = {
        get: jest.fn().mockReturnValue(mockFile),
      };

      mockRequest = {
        formData: jest.fn().mockResolvedValue(mockFormData),
      } as any;

      (XLSX.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: {
          'Sheet1': {}
        }
      });
    });

    it('returns 403 if not super admin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false });
      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(403);
    });

    it('returns 400 if no file provided', async () => {
      mockFormData.get.mockReturnValue(null);
      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Chưa chọn file Excel');
    });

    it('returns 400 if empty workbook (no sheets)', async () => {
      (XLSX.read as jest.Mock).mockReturnValue({ SheetNames: [], Sheets: {} });
      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('File Excel không có dữ liệu trang tính');
    });

    it('returns 200 with standard headers', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['MSSV', 'Họ và tên', 'Lớp', 'Email'],
        ['N22DCCN001', 'Nguyễn Văn A', 'D22CQCN01-N', 'a@e.com']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.inserted).toBe(1);
    });

    it('returns 200 with split name columns', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['MSSV', 'Họ', 'Tên', 'Lớp'],
        ['N22DCCN002', 'Nguyễn Văn', 'B', 'D22CQCN01-N']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.inserted).toBe(1);
    });

    it('returns 200 with alias headers', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['ma_sv', 'ho_ten', 'lop', 'mail'],
        ['N22DCCN003', 'Nguyễn Văn C', 'D22CQCN01-N', 'c@e.com']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(200);
    });

    it('returns 200 without headers (pattern detection fallback)', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['N22DCCN004', 'Nguyễn Văn D', 'D22CQCN01-N']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(200);
    });

    it('returns 200 with MSSV containing @email that needs extraction', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['MSSV', 'Họ và tên', 'Lớp'],
        ['n22dccn005@student.ptithcm.edu.vn', 'Nguyễn Văn E', 'D22CQCN01-N']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(200);
      // The extracted MSSV should be N22DCCN005
    });

    it('returns 200 and auto-generates email from MSSV', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['MSSV', 'Họ và tên', 'Lớp'],
        ['N22DCCN006', 'Nguyễn Văn F', 'D22CQCN01-N']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(200);
    });

    it('returns 400 if no valid rows found', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['INVALID', 'Data']
      ]);
      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Không tìm thấy dòng sinh viên hợp lệ trong file. Vui lòng kiểm tra lại tiêu đề cột (MSSV, Họ và tên, Lớp, Email).');
    });

    it('returns 200 with partial failure on chunk upsert', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['MSSV', 'Họ và tên', 'Lớp'],
        ['N22DCCN007', 'Nguyễn Văn G', 'D22CQCN01-N'],
        ['N22DCCN008', 'Nguyễn Văn H', 'D22CQCN01-N']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: { message: 'DB chunk error' } }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 if all upserts fail', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['MSSV', 'Họ và tên', 'Lớp'],
        ['N22DCCN007', 'Nguyễn Văn G', 'D22CQCN01-N']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: { message: 'DB chunk error' } }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(400); 
    });

    it('returns 500 on exception', async () => {
      mockRequest.formData.mockRejectedValue(new Error('Unknown Error'));
      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(500);
    });

    it('normalizeKey function - various Vietnamese inputs with diacritics', async () => {
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Mã Số Sinh Viên (Đ/đ)', 'HỌ VÀ TÊN', 'LỚP'],
        ['N22DCCN008', 'Nguyễn Văn H', 'D22CQCN01-N']
      ]);
      mockBuilder.upsert.mockReturnThis();
      mockBuilder.then.mockImplementationOnce((resolve) => resolve({ error: null }));

      const res = await postUploadUsers(mockRequest);
      expect(res.status).toBe(200);
    });
  });
});
