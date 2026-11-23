import { GET as getEvents, POST as createEvent } from '@/app/api/events/route';
import { DELETE as deleteEvent } from '@/app/api/events/[id]/route';
import { GET as getMaintenance, PATCH as toggleMaintenance } from '@/app/api/admin/maintenance/route';
import { GET as getHistory } from '@/app/api/me/history/route';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { invalidateAuthContextCache } from '@/lib/supabase/auth-helper';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

describe('Whitebox Tests: Admin & Event API Routes', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateAuthContextCache();
  });

  const setupMockSupabase = (userEmail: string | null = 'admin@ptit.edu.vn', isSuperAdmin = true) => {
    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: userEmail ? { user: { email: userEmail } } : null },
        }),
        getUser: jest.fn().mockResolvedValue({
          data: { user: userEmail ? { email: userEmail } : null },
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'super_admins') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            upsert: jest.fn().mockResolvedValue({ error: null }),
            single: jest.fn().mockResolvedValue({
              data: isSuperAdmin ? { email: userEmail } : null,
              error: null,
            }),
            maybeSingle: jest.fn().mockResolvedValue({
              data: isSuperAdmin ? { email: userEmail } : null,
              error: null,
            }),
          };
        }
        if (table === 'event_roles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockResolvedValue({ data: [], error: null }),
            delete: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
            then: (resolve: any, reject?: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
          };
        }
        if (table === 'events') {
          const eventList = [{ event_id: 'e1', event_name: 'Sự kiện 1', semester: 'HK1', status: 'active' }];
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            maybeSingle: jest.fn().mockResolvedValue({ data: eventList[0], error: null }),
            single: jest.fn().mockResolvedValue({ data: eventList[0], error: null }),
            order: jest.fn().mockResolvedValue({
              data: eventList,
              error: null,
            }),
            insert: jest.fn().mockImplementation((data: any) => ({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { event_id: 'e2', ...data }, error: null }),
            })),
            delete: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'event_proposals') {
          return {
            update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
            delete: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { mssv: 'N22DCCN001' },
              error: null,
            }),
            single: jest.fn().mockResolvedValue({
              data: { mssv: 'N22DCCN001' },
              error: null,
            }),
          };
        }
        if (table === 'check_ins') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
            order: jest.fn().mockResolvedValue({
              data: [{ participate_role: 'participant', created_at: '2026-09-15T14:30:00Z', events: { event_name: 'Sự kiện 1', semester: 'HK1' } }],
              error: null,
            }),
          };
        }
        if (table === 'system_settings') {
          let lastEqVal = '';
          const settingsChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((_col: string, val: string) => {
              lastEqVal = val;
              return settingsChain;
            }),
            in: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
              in: jest.fn().mockResolvedValue({ error: null }),
            }),
            single: jest.fn().mockImplementation(() =>
              Promise.resolve({
                data: lastEqVal === 'maintenance_mode'
                  ? { maintenance_mode: false, maintenance_message: 'Đang bảo trì' }
                  : null,
                error: null,
              })
            ),
            maybeSingle: jest.fn().mockImplementation(() =>
              Promise.resolve({
                data: lastEqVal === 'maintenance_mode'
                  ? { maintenance_mode: false, maintenance_message: 'Đang bảo trì' }
                  : null,
                error: null,
              })
            ),
            upsert: jest.fn().mockImplementation(() => ({
              select: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { maintenance_mode: true, maintenance_message: 'Đang chốt điểm' },
                error: null,
              }),
              single: jest.fn().mockResolvedValue({
                data: { maintenance_mode: true, maintenance_message: 'Đang chốt điểm' },
                error: null,
              }),
            })),
            update: jest.fn().mockImplementation(() => ({
              eq: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { maintenance_mode: true, maintenance_message: 'Đang chốt điểm' },
                error: null,
              }),
            })),
            then: (resolve: any, reject?: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
          };
          return settingsChain;
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
            in: jest.fn().mockResolvedValue({ error: null }),
          }),
          then: (resolve: any, reject?: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
      }),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);
  };

  describe('Events API (/api/events)', () => {
    test('GET /api/events returns event list for authenticated user', async () => {
      setupMockSupabase();
      const res = await getEvents();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    test('POST /api/events creates new event for Super Admin', async () => {
      setupMockSupabase('admin@ptit.edu.vn', true);
      const req = new Request('http://localhost:3000/api/events', {
        method: 'POST',
        body: JSON.stringify({ event_name: 'Ngày hội IT', semester: '2026-HK1' }),
      });
      const res = await createEvent(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.event_name).toBe('Ngày hội IT');
    });

    test('POST /api/events rejects non-admin users with 403 Forbidden', async () => {
      setupMockSupabase('student@ptit.edu.vn', false);
      const req = new Request('http://localhost:3000/api/events', {
        method: 'POST',
        body: JSON.stringify({ event_name: 'Ngày hội IT', semester: '2026-HK1' }),
      });
      const res = await createEvent(req);
      expect(res.status).toBe(403);
    });
  });

  describe('Maintenance API (/api/admin/maintenance)', () => {
    test('GET /api/admin/maintenance returns public maintenance state without auth', async () => {
      setupMockSupabase(null);
      const res = await getMaintenance();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.maintenance_mode).toBe(false);
    });

    test('PATCH /api/admin/maintenance allows Super Admin to toggle maintenance mode', async () => {
      setupMockSupabase('admin@ptit.edu.vn', true);
      const req = new Request('http://localhost:3000/api/admin/maintenance', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true, message: 'Đang chốt điểm' }),
      });
      const res = await toggleMaintenance(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('History API (/api/me/history)', () => {
    test('GET /api/me/history returns student check-in history', async () => {
      setupMockSupabase('student@ptit.edu.vn', false);
      const res = await getHistory();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data[0].event_name).toBe('Sự kiện 1');
      expect(body.data[0].participate_role).toBe('participant');
    });
  });

  describe('DELETE Event API (/api/events/[id])', () => {
    test('DELETE /api/events/[id] allows Super Admin to delete event and related records', async () => {
      setupMockSupabase('admin@ptit.edu.vn', true);
      const req = new Request('http://localhost:3000/api/events/e1', { method: 'DELETE' });
      const res = await deleteEvent(req, { params: Promise.resolve({ id: 'e1' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('xóa');
    });

    test('DELETE /api/events/[id] rejects regular student with 403 Forbidden', async () => {
      setupMockSupabase('student@ptit.edu.vn', false);
      const req = new Request('http://localhost:3000/api/events/e1', { method: 'DELETE' });
      const res = await deleteEvent(req, { params: Promise.resolve({ id: 'e1' }) });
      expect(res.status).toBe(403);
    });
  });
});
