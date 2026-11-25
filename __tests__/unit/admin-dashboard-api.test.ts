import { GET } from '@/app/api/admin/dashboard/route';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getEventMetaBatch } from '@/lib/constants/event-meta-store';
import { getAcademicSemesters, getActiveSemester } from '@/lib/utils/semesters';

jest.mock('@/lib/supabase/auth-helper', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

jest.mock('@/lib/constants/event-meta-store', () => ({
  getEventMetaBatch: jest.fn(),
}));

jest.mock('@/lib/utils/semesters', () => ({
  ...jest.requireActual('@/lib/utils/semesters'),
  getAcademicSemesters: jest.fn(),
  getActiveSemester: jest.fn(),
}));

jest.mock('@/lib/utils/graduated-cohorts', () => ({
  getGraduatedCohortsConfig: jest.fn().mockResolvedValue({ rules: [], deleted_cohorts: [] }),
  isStudentGraduated: jest.fn().mockReturnValue(false),
  isStudentInDeletedCohort: jest.fn().mockReturnValue(false),
}));

jest.mock('@/lib/constants/handover-store', () => ({
  getHandoverRegistryFromDb: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/utils/student-profile', () => ({
  getMasterStudentDirectory: jest.fn().mockReturnValue(new Map()),
  getMasterStudentByMssv: jest.fn().mockReturnValue(null),
  isPlaceholderClass: jest.fn().mockReturnValue(false),
}));

function buildTableMock(tableData: Record<string, any[]>) {
  return (table: string) => {
    const rows = tableData[table] || [];
    const chain: any = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockImplementation((from: number) =>
        Promise.resolve({ data: from === 0 ? rows : [], error: null })
      ),
      then: jest.fn().mockImplementation((resolve: any) =>
        Promise.resolve({ data: rows, error: null }).then(resolve)
      ),
    };
    return chain;
  };
}

describe('GET /api/admin/dashboard open/closed KPI counts', () => {
  const semester = {
    id: 'hk1_2627',
    name: 'HK1 2026-2027',
    start_date: '2026-08-01',
    end_date: '2099-12-31',
    is_active: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__hddAdminDashboardCache?.clear?.();
    (getAcademicSemesters as jest.Mock).mockResolvedValue([semester]);
    (getActiveSemester as jest.Mock).mockReturnValue(semester);
  });

  it('counts multi-session and multi-day active events as open even when event_date is in the past', async () => {
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'sa@ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });

    const events = [
      {
        event_id: 'ev-multi-session',
        event_name: 'Giải Bóng Đá Tân Sinh Viên',
        event_date: '2026-11-16',
        start_time: '16:50:00',
        end_time: '20:30:00',
        status: 'active',
        is_active: true,
        created_by: 'sa@ptithcm.edu.vn',
      },
      {
        event_id: 'ev-multi-day-meta',
        event_name: 'Tuần lễ Workshop Thiết Kế',
        event_date: '2026-11-23',
        start_time: '08:00:00',
        end_time: '21:00:00',
        status: 'active',
        is_active: true,
        created_by: 'sa@ptithcm.edu.vn',
      },
      {
        event_id: 'ev-past-closed',
        event_name: 'Sự kiện đã kết thúc',
        event_date: '2026-10-10',
        start_time: '08:00:00',
        end_time: '11:00:00',
        status: 'active',
        is_active: true,
        created_by: 'sa@ptithcm.edu.vn',
      },
    ];

    const supabaseMock = {
      from: jest.fn(
        buildTableMock({
          events,
          event_proposals: [],
          class_delegates: [],
          user_penalties: [],
          office_borrow_requests: [],
          office_borrow_bans: [],
          push_subscriptions: [],
          unit_ratings: [],
          users: [],
          check_ins: [],
          event_registrations: [],
        })
      ),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);
    (createClient as jest.Mock).mockResolvedValue(supabaseMock);

    (getEventMetaBatch as jest.Mock).mockResolvedValue({
      'ev-multi-session': {
        sessions: [
          { id: 's1', session_date: '2026-11-16', start_time: '16:50', end_time: '20:30', room_name: 'Sân bóng' },
          { id: 's2', session_date: '2099-12-01', start_time: '16:50', end_time: '20:30', room_name: 'Sân bóng' },
        ],
      },
      'ev-multi-day-meta': {
        end_date: '2099-12-05',
        location: 'Hội trường A',
        sessions: [],
      },
      'ev-past-closed': {
        sessions: [],
      },
    });

    const res = await GET(new Request('http://localhost:3000/api/admin/dashboard?refresh=1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.kpis.total_events_in_semester).toBe(3);
    expect(json.data.kpis.open_events_count).toBe(2);
    expect(json.data.kpis.closed_events_count).toBe(1);
  });
});
