import { GET } from '@/app/api/me/route';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('Whitebox Tests: GET /api/me (Role Tier Resolution & Error Paths)', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupMockSupabase = ({
    sessionUser = { email: 'student@ptit.edu.vn' },
    dbUser = { mssv: 'N22DCCN001', full_name: 'Nguyễn Văn An', class_id: 'D22CQCN01-N' },
    superAdmin = null,
    eventRoles = [],
    allEvents = [],
  }: any) => {
    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: sessionUser ? { user: sessionUser } : null },
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: dbUser, error: null }),
          };
        }
        if (table === 'super_admins') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: superAdmin, error: null }),
          };
        }
        if (table === 'event_roles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: eventRoles, error: null }),
          };
        }
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: allEvents, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  };

  test('Branch 1: Returns 401 Unauthorized if no active session', async () => {
    setupMockSupabase({ sessionUser: null });

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('Branch 2: Returns 404 Not Found if user is not in users table', async () => {
    setupMockSupabase({ dbUser: null });

    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('Branch 3: Resolves tier to "super_admin" when user exists in super_admins table', async () => {
    setupMockSupabase({
      superAdmin: { email: 'student@ptit.edu.vn' },
      eventRoles: [{ event_id: 'e1', role_type: 'checker' }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('super_admin');
  });

  test('Branch 4: Resolves tier to "event_admin" when user has event_admin role in events', async () => {
    setupMockSupabase({
      superAdmin: null,
      eventRoles: [
        { event_id: 'e1', role_type: 'event_admin', events: { event_name: 'Ngày hội CN' } },
        { event_id: 'e2', role_type: 'checker', events: { event_name: 'Hiến máu' } },
      ],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('event_admin');
    expect(body.data.managed_events).toHaveLength(2);
  });

  test('Branch 5: Resolves tier to "checker" when user only has checker roles', async () => {
    setupMockSupabase({
      superAdmin: null,
      eventRoles: [{ event_id: 'e2', role_type: 'checker', events: { event_name: 'Hiến máu' } }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('checker');
  });

  test('Branch 6: Resolves tier to "user" (regular student) when user has no special roles', async () => {
    setupMockSupabase({
      superAdmin: null,
      eventRoles: [],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('user');
    expect(body.data.managed_events).toEqual([]);
  });

  test('Branch 7: Returns 404 for non-registered non-student user', async () => {
    setupMockSupabase({
      sessionUser: { email: 'random@gmail.com' },
      dbUser: null,
    });

    const res = await GET();
    expect(res.status).toBe(404);
  });

  test('Branch 8: Resolves super_admin tier and fetches all managed events', async () => {
    setupMockSupabase({
      sessionUser: { email: 'admin@ptithcm.edu.vn' },
      dbUser: { mssv: 'ADMIN', full_name: 'Admin', class_id: 'BCH' },
      superAdmin: { email: 'admin@ptithcm.edu.vn' },
      allEvents: [{ event_id: 'e1', event_name: 'Event 1' }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('super_admin');
    expect(body.data.managed_events).toHaveLength(1);
  });

  test('Branch 9: Detects youth_union tier from email', async () => {
    setupMockSupabase({
      sessionUser: { email: 'doanthanhnien@ptithcm.edu.vn' },
      dbUser: null,
      superAdmin: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('youth_union');
  });

  test('Branch 10: Detects ctsv tier from email', async () => {
    setupMockSupabase({
      sessionUser: { email: 'phongctsv@ptithcm.edu.vn' },
      dbUser: null,
      superAdmin: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('ctsv');
  });

  test('Branch 11: Detects facility tier from email with quantri keyword', async () => {
    setupMockSupabase({
      sessionUser: { email: 'phongquantri@ptithcm.edu.vn' },
      dbUser: null,
      superAdmin: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('facility');
  });
});
