import { POST } from '@/app/api/checkin/route';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

// Mock Supabase Server Client & Auth
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/supabase/auth-helper', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true }),
}));

describe('Whitebox Tests: POST /api/checkin (Branch & Path Coverage)', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupMockSupabase = (sessionUser: any = { email: 'checker@ptit.edu.vn' }) => {
    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: sessionUser ? { user: sessionUser } : null },
        }),
      },
      from: jest.fn(),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  };

  test('Branch 1: Returns 401 Unauthorized when session is null', async () => {
    setupMockSupabase(null);

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-uuid-1',
        participate_role: 'participant',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  test('Branch 2: Returns 400 Bad Request when required body fields are missing', async () => {
    setupMockSupabase();

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: '',
        event_id: 'event-uuid-1',
        // missing participate_role
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('không hợp lệ');
  });

  test('Branch 3: Returns 400 Bad Request when event is closed or not found', async () => {
    setupMockSupabase();

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { status: 'closed' }, error: null }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-uuid-closed',
        participate_role: 'participant',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('Sự kiện đã đóng');
  });

  test('Branch 4: Returns 404 Not Found when student does not exist in users table', async () => {
    setupMockSupabase();

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'UNKNOWN999',
        event_id: 'event-uuid-active',
        participate_role: 'participant',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('Không tìm thấy sinh viên');
  });

  test('Branch 5: Returns 409 Conflict when unique constraint 23505 violated (Duplicate check-in)', async () => {
    setupMockSupabase();

    const existingTime = '2026-09-15T14:30:00Z';

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { mssv: 'N22DCCN001', full_name: 'Nguyễn Văn An', class_id: 'D22CQCN01-N' },
            error: null,
          }),
        };
      }
      if (table === 'check_ins') {
        return {
          insert: jest.fn().mockResolvedValue({
            error: { code: '23505', message: 'duplicate key' },
          }),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { created_at: existingTime },
            error: null,
          }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-uuid-active',
        participate_role: 'participant',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Conflict');
    expect(body.checked_at).toBe(existingTime);
  });

  test('Branch 6: Returns 200 Success for valid student check-in', async () => {
    setupMockSupabase();

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { mssv: 'N22DCCN001', full_name: 'Nguyễn Văn An', class_id: 'D22CQCN01-N' },
            error: null,
          }),
        };
      }
      if (table === 'check_ins') {
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-uuid-active',
        participate_role: 'participant',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.student.mssv).toBe('N22DCCN001');
    expect(body.data.student.full_name).toBe('Nguyễn Văn An');
    expect(body.data.checkin_time).toBeDefined();
  });

  test('Branch 7: Returns 403 Forbidden when standard checker attempts to check in organizer role', async () => {
    setupMockSupabase({ email: 'checker@ptit.edu.vn' });
    (getAuthContext as jest.Mock).mockResolvedValueOnce({
      email: 'checker@ptit.edu.vn',
      tier: 'checker',
      isSuperAdmin: false,
      isEventAdmin: false,
      isChecker: true,
    });

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-uuid-active',
        participate_role: 'organizer',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('Checker chỉ có quyền điểm danh Người tham gia');
  });

  test('Branch 8: Returns 200 Success when event_admin checks in volunteer role', async () => {
    setupMockSupabase({ email: 'event_admin@ptit.edu.vn' });
    (getAuthContext as jest.Mock).mockResolvedValueOnce({
      email: 'event_admin@ptit.edu.vn',
      tier: 'event_admin',
      isSuperAdmin: false,
      isEventAdmin: true,
      isChecker: true,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { mssv: 'N22DCCN001', full_name: 'Nguyễn Văn An', class_id: 'D22CQCN01-N' },
            error: null,
          }),
        };
      }
      if (table === 'check_ins') {
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-uuid-active',
        participate_role: 'volunteer',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
