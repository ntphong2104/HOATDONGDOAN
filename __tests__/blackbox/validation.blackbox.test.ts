import { POST } from '@/app/api/checkin/route';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { invalidateAuthContextCache } from '@/lib/supabase/auth-helper';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

describe('Blackbox Tests: Validation & Equivalence Partitioning', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateAuthContextCache();
  });

  const setupEnv = () => {
    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { email: 'checker@ptit.edu.vn' } } },
        }),
        getUser: jest.fn().mockResolvedValue({
          data: { user: { email: 'checker@ptit.edu.vn' } },
          error: null,
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'events') {
          const eventResult = { data: { event_id: 'ev-1', status: 'active' }, error: null };
          const chain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            single: jest.fn().mockResolvedValue(eventResult),
            maybeSingle: jest.fn().mockResolvedValue(eventResult),
          };
          return chain;
        }
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((_col: string, val: string) => {
              // Valid students in the system
              const res = ['N22DCCN001', 'B21DCAT123'].includes(val)
                ? { data: { mssv: val, full_name: 'Sinh Viên Chuẩn', class_id: 'D22CQCN01', phone: '0987654321' }, error: null }
                : { data: null, error: null };
              return {
                single: jest.fn().mockResolvedValue(res),
                maybeSingle: jest.fn().mockResolvedValue(res),
              };
            }),
          };
        }
        if (table === 'event_roles') {
          const rolesResult = { data: [{ event_id: 'ev-1', role_type: 'checker' }], error: null };
          const chain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { role_type: 'checker' }, error: null }),
            single: jest.fn().mockResolvedValue({ data: { role_type: 'checker' }, error: null }),
            then: (resolve: any, reject?: any) => Promise.resolve(rolesResult).then(resolve, reject),
          };
          return chain;
        }
        if (table === 'check_ins') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'system_settings') {
          let lastKey = '';
          const chain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((_col: string, val: string) => {
              lastKey = val;
              return chain;
            }),
            maybeSingle: jest.fn().mockImplementation(() =>
              Promise.resolve({
                data: lastKey.startsWith('event_meta_')
                  ? { value: JSON.stringify({ require_registration: false }) }
                  : null,
                error: null,
              })
            ),
            single: jest.fn().mockImplementation(() =>
              Promise.resolve({
                data: lastKey.startsWith('event_meta_')
                  ? { value: JSON.stringify({ require_registration: false }) }
                  : null,
                error: null,
              })
            ),
          };
          return chain;
        }
        if (table === 'event_registrations') {
          const chain: any = {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
            upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
            update: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: any, reject?: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
          };
          return chain;
        }
        const defaultChain: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          then: (resolve: any, reject?: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
        return defaultChain;
      }),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);
  };

  describe('Equivalence Partition: MSSV Parameter', () => {
    beforeEach(() => setupEnv());

    test('Valid Equivalence Class: Standard 10-char MSSV returns 200', async () => {
      const req = new Request('http://localhost:3000/api/checkin', {
        method: 'POST',
        body: JSON.stringify({
          mssv: 'N22DCCN001',
          event_id: 'ev-1',
          participate_role: 'participant',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    test('Invalid Equivalence Class: SQL injection payload safely rejected as not found (no SQL error leak)', async () => {
      const sqlInjectionMSSV = "' OR '1'='1' --";
      const req = new Request('http://localhost:3000/api/checkin', {
        method: 'POST',
        body: JSON.stringify({
          mssv: sqlInjectionMSSV,
          event_id: 'ev-1',
          participate_role: 'participant',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400); // Rejected early by strict MSSV format validator
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('Invalid Equivalence Class: Empty string MSSV returns 400 Bad Request', async () => {
      const req = new Request('http://localhost:3000/api/checkin', {
        method: 'POST',
        body: JSON.stringify({
          mssv: '',
          event_id: 'ev-1',
          participate_role: 'participant',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('Equivalence Partition: Event Roles', () => {
    beforeEach(() => setupEnv());

    test('Valid Role: "participant" is accepted for checker with status 200', async () => {
      const req = new Request('http://localhost:3000/api/checkin', {
        method: 'POST',
        body: JSON.stringify({
          mssv: 'N22DCCN001',
          event_id: 'ev-1',
          participate_role: 'participant',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    test.each([
      ['volunteer', 403],
      ['organizer', 403],
    ])('Restricted Role for Checker: "%s" is rejected with status %i', async (role, expectedStatus) => {
      const req = new Request('http://localhost:3000/api/checkin', {
        method: 'POST',
        body: JSON.stringify({
          mssv: 'N22DCCN001',
          event_id: 'ev-1',
          participate_role: role,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(expectedStatus);
    });

    test.each([
      [''],
      ['super_admin'],
      ['hacker'],
      ['undefined'],
    ])('Invalid Role Partition: "%s" is rejected with 400 Bad Request', async (invalidRole) => {
      const req = new Request('http://localhost:3000/api/checkin', {
        method: 'POST',
        body: JSON.stringify({
          mssv: 'N22DCCN001',
          event_id: 'ev-1',
          participate_role: invalidRole,
        }),
      });

      const res = await POST(req);
      // Either 400 (if empty/invalid)
      expect(res.status).toBe(400);
    });
  });
});
