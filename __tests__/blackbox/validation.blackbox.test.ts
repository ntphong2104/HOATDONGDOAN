import { POST } from '@/app/api/checkin/route';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('Blackbox Tests: Validation & Equivalence Partitioning', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupEnv = () => {
    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { email: 'checker@ptit.edu.vn' } } },
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockImplementation(() =>
              Promise.resolve({ data: { status: 'active' }, error: null })
            ),
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => {
              // Valid students in the system
              if (['N22DCCN001', 'B21DCAT123'].includes(val)) {
                return {
                  single: jest.fn().mockResolvedValue({
                    data: { mssv: val, full_name: 'Sinh Viên Chuẩn', class_id: 'D22CQCN01' },
                    error: null,
                  }),
                };
              }
              return { single: jest.fn().mockResolvedValue({ data: null, error: null }) };
            }),
          };
        }
        if (table === 'check_ins') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
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
      expect(res.status).toBe(404); // Handled safely via parameterized queries
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
