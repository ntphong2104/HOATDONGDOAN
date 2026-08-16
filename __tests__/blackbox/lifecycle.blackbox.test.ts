import { POST } from '@/app/api/checkin/route';
import { GET as getCheckins } from '@/app/api/events/[id]/checkins/route';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('Blackbox Tests: End-to-End Operational Lifecycle', () => {
  let dbEvents: Record<string, { event_id: string; event_name: string; semester: string; status: 'active' | 'closed' }> = {};
  let dbUsers: Record<string, { mssv: string; email: string; full_name: string; class_id: string }> = {};
  let dbCheckins: Array<{ mssv: string; event_id: string; participate_role: string; checked_by: string; created_at: string }> = [];

  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Seed initial operational state
    dbEvents = {
      'event-001': {
        event_id: 'event-001',
        event_name: 'Ngày Hội Sinh Viên 2026',
        semester: '2026-2027-HK1',
        status: 'active',
      },
    };

    dbUsers = {
      N22DCCN001: {
        mssv: 'N22DCCN001',
        email: 'n22dccn001@ptit.edu.vn',
        full_name: 'Nguyễn Văn An',
        class_id: 'D22CQCN01-N',
      },
      N22DCCN002: {
        mssv: 'N22DCCN002',
        email: 'n22dccn002@ptit.edu.vn',
        full_name: 'Trần Thị Bích',
        class_id: 'D22CQCN01-N',
      },
      N22DCCN003: {
        mssv: 'N22DCCN003',
        email: 'n22dccn003@ptit.edu.vn',
        full_name: 'Lê Văn Cường',
        class_id: 'D22CQCN01-N',
      },
    };

    dbCheckins = [];

    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { email: 'admin@ptit.edu.vn' } } },
        }),
        getUser: jest.fn().mockResolvedValue({
          data: { user: { email: 'admin@ptit.edu.vn' } },
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'super_admins') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              single: jest.fn().mockResolvedValue({ data: val === 'admin@ptit.edu.vn' ? { email: val } : null, error: null }),
              maybeSingle: jest.fn().mockResolvedValue({ data: val === 'admin@ptit.edu.vn' ? { email: val } : null, error: null }),
            })),
            ilike: jest.fn().mockImplementation((col: string, val: string) => ({
              single: jest.fn().mockResolvedValue({ data: val === 'admin@ptit.edu.vn' ? { email: val } : null, error: null }),
              maybeSingle: jest.fn().mockResolvedValue({ data: val === 'admin@ptit.edu.vn' ? { email: val } : null, error: null }),
            })),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'event_roles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockResolvedValue({ data: [], error: null }),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              single: jest.fn().mockImplementation(() =>
                Promise.resolve({ data: dbEvents[val] || null, error: null })
              ),
            })),
          };
        }
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              single: jest.fn().mockImplementation(() =>
                Promise.resolve({ data: dbUsers[val] || null, error: null })
              ),
            })),
          };
        }
        if (table === 'check_ins') {
          return {
            insert: jest.fn().mockImplementation((record: any) => {
              const duplicate = dbCheckins.find(
                (c) => c.mssv === record.mssv && c.event_id === record.event_id
              );
              if (duplicate) {
                return Promise.resolve({
                  error: { code: '23505', message: 'duplicate key' },
                });
              }
              const newEntry = { ...record, created_at: new Date().toISOString() };
              dbCheckins.push(newEntry);
              return Promise.resolve({ data: newEntry, error: null });
            }),
            select: jest.fn().mockImplementation(() => ({
              eq: jest.fn().mockImplementation((col: string, val: string) => ({
                eq: jest.fn().mockImplementation((col2: string, val2: string) => ({
                  single: jest.fn().mockImplementation(() => {
                    const found = dbCheckins.find((c) => c.mssv === val && c.event_id === val2);
                    return Promise.resolve({ data: found || null, error: null });
                  }),
                })),
                order: jest.fn().mockImplementation(() => {
                  const filtered = dbCheckins.filter((c) => c.event_id === val);
                  const result = filtered.map((c) => ({
                    ...c,
                    users: dbUsers[c.mssv],
                  }));
                  return Promise.resolve({ data: result, error: null });
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };

    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  test('Complete Lifecycle Scenario: Scan -> Prevent Duplicate -> Close Event -> Export Report', async () => {
    // Step 1: Checker scans Student 1 (N22DCCN001) for the first time
    const scan1Req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-001',
        participate_role: 'participant',
      }),
    });
    const scan1Res = await POST(scan1Req);
    expect(scan1Res.status).toBe(200);
    const scan1Body = await scan1Res.json();
    expect(scan1Body.success).toBe(true);
    expect(scan1Body.data.student.full_name).toBe('Nguyễn Văn An');

    // Step 2: Checker accidentally scans Student 1 a second time -> Expect 409 Conflict
    const scan2Req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN001',
        event_id: 'event-001',
        participate_role: 'participant',
      }),
    });
    const scan2Res = await POST(scan2Req);
    expect(scan2Res.status).toBe(409);
    const scan2Body = await scan2Res.json();
    expect(scan2Body.success).toBe(false);
    expect(scan2Body.error).toBe('Conflict');

    // Step 3: Checker scans Student 2 (N22DCCN002) as Volunteer -> Expect 200 Success
    const scan3Req = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN002',
        event_id: 'event-001',
        participate_role: 'volunteer',
      }),
    });
    const scan3Res = await POST(scan3Req);
    expect(scan3Res.status).toBe(200);

    // Step 4: Event Admin closes the event
    dbEvents['event-001'].status = 'closed';

    // Step 5: Regular Checker scanning after event closure is blocked -> Expect 400 Bad Request
    mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
      data: { user: { email: 'checker@ptit.edu.vn' } },
    });
    mockSupabase.auth.getSession = jest.fn().mockResolvedValue({
      data: { session: { user: { email: 'checker@ptit.edu.vn' } } },
    });
    const scanAfterCloseReq = new Request('http://localhost:3000/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        mssv: 'N22DCCN003',
        event_id: 'event-001',
        participate_role: 'participant',
      }),
    });
    const scanAfterCloseRes = await POST(scanAfterCloseReq);
    expect(scanAfterCloseRes.status).toBe(400);

    // Step 6: Export Event Check-in data for Excel report
    mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
      data: { user: { email: 'admin@ptit.edu.vn' } },
    });
    mockSupabase.auth.getSession = jest.fn().mockResolvedValue({
      data: { session: { user: { email: 'admin@ptit.edu.vn' } } },
    });
    const exportReq = new Request('http://localhost:3000/api/events/event-001/checkins', {
      method: 'GET',
    });
    const exportRes = await getCheckins(exportReq, { params: Promise.resolve({ id: 'event-001' }) });
    expect(exportRes.status).toBe(200);
    const exportBody = await exportRes.json();
    expect(exportBody.success).toBe(true);
    expect(exportBody.data).toHaveLength(2);
    expect(exportBody.data[0].mssv).toBe('N22DCCN001');
    expect(exportBody.data[1].mssv).toBe('N22DCCN002');
  });
});
