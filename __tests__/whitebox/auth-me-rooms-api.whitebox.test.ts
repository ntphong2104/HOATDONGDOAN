import { NextRequest } from 'next/server';
import { POST as DemoPOST, DELETE as DemoDELETE } from '@/app/api/auth/demo/route';
import { POST as LogoutPOST, GET as LogoutGET } from '@/app/api/auth/logout/route';
import { GET as MeGET } from '@/app/api/me/route';
import { GET as MeHistoryGET } from '@/app/api/me/history/route';
import { GET as ClassLookupGET } from '@/app/api/me/class-lookup/route';
import { GET as ClassStudentsGET } from '@/app/api/me/class-lookup/students/route';
import { GET as ClassHistoryGET } from '@/app/api/me/class-lookup/history/route';
import { GET as RoomsGET, POST as RoomsPOST } from '@/app/api/rooms/route';
import { PATCH as RoomPATCH, DELETE as RoomDELETE } from '@/app/api/rooms/[id]/route';
import { GET as RegisterGET, POST as RegisterPOST, DELETE as RegisterDELETE } from '@/app/api/events/[id]/register/route';
import { GET as RatingsGET, POST as RatingsPOST } from '@/app/api/events/[id]/ratings/route';
import { POST as ReconcilePOST } from '@/app/api/events/[id]/reconcile-attendance/route';

// Mocks
jest.mock('next/headers', () => {
  const cookieStore = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
  };
  return {
    cookies: jest.fn().mockReturnValue(cookieStore),
  };
});

const mockQueryBuilder: any = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: {}, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: {}, error: null }),
  then: jest.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
};

const mockSupabase: any = {
  from: jest.fn().mockReturnValue(mockQueryBuilder),
  auth: {
    signOut: jest.fn().mockResolvedValue({ error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
  },
};

jest.mock('next/server', () => {
  class MockNextResponse {
    cookies = { set: jest.fn(), delete: jest.fn() };
    body: any;
    status: number;
    constructor(body: any, init: any) {
      this.body = body;
      this.status = init?.status || 200;
    }
    json() {
      return Promise.resolve(this.body);
    }
    static json(body: any, init: any) {
      return new MockNextResponse(body, init);
    }
  }
  return {
    NextResponse: MockNextResponse,
  };
});

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockImplementation(() => Promise.resolve(mockSupabase)),
}));

jest.mock('@/lib/supabase/auth-helper', () => ({
  getAuthContext: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/utils/extract-mssv', () => ({
  extractMSSV: jest.fn().mockReturnValue('N22DCCN001'),
}));

jest.mock('@/lib/utils/blacklist-logic', () => ({
  isRegistrationWindowOpen: jest.fn().mockReturnValue({ isOpen: true }),
  reconcileAttendance: jest.fn().mockReturnValue({ attended: [], absent: [] }),
  MAX_MISSED_STRIKES: 3,
}));

import { cookies } from 'next/headers';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import * as authHelper from '@/lib/supabase/auth-helper';
import * as blacklistLogic from '@/lib/utils/blacklist-logic';

describe('API Route Whitebox Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auth/demo/route', () => {
    it('POST should set cookie and return profile', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ role: 'checker' }),
      });
      const res = await DemoPOST(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.profile.tier).toBe('checker');
    });

    it('POST should handle unknown role by using event_admin if lcd/clb/doi or user fallback', async () => {
      const req1 = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ role: 'clb.new' }),
      });
      const res1 = await DemoPOST(req1);
      const data1 = await res1.json();
      expect(data1.profile.tier).toBe('event_admin');

      const req2 = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ role: 'unknown' }),
      });
      const res2 = await DemoPOST(req2);
      const data2 = await res2.json();
      expect(data2.profile.tier).toBe('user');
    });

    it('DELETE should clear demo cookie', async () => {
      const res = await DemoDELETE();
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('auth/logout/route', () => {
    it('POST should clear cookies and sign out', async () => {
      (cookies().getAll as jest.Mock).mockReturnValue([{ name: 'sb-test' }]);
      const req = new Request('http://localhost', { method: 'POST' });
      const res = await LogoutPOST(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });

    it('GET should call POST', async () => {
      const req = new Request('http://localhost', { method: 'GET' });
      const res = await LogoutGET(req);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('me/route', () => {
    it('GET should return demo user if cookie exists', async () => {
      (cookies().get as jest.Mock).mockReturnValue({ value: encodeURIComponent(JSON.stringify({ mssv: 'TEST', email: 'test@student.ptithcm.edu.vn' })) });
      const res = await MeGET();
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.mssv).toBe('TEST');
    });

    it('GET should return 401 if not logged in', async () => {
      (cookies().get as jest.Mock).mockReturnValue(undefined);
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const res = await MeGET();
      expect(res.status).toBe(401);
    });

    it('GET should return user data if logged in', async () => {
      (cookies().get as jest.Mock).mockReturnValue(undefined);
      mockSupabase.auth.getUser.mockResolvedValueOnce({ 
        data: { user: { email: 'test@student.ptithcm.edu.vn', user_metadata: {} } } 
      });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { mssv: 'TEST', full_name: 'Test' } }) // user
        .mockResolvedValueOnce({ data: null }); // superAdmin
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();

      const res = await MeGET();
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.mssv).toBe('TEST');
    });
  });

  describe('me/history/route', () => {
    it('GET should return 401 if no session', async () => {
      mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
      const res = await MeHistoryGET();
      expect(res.status).toBe(401);
    });

    it('GET should return history if session exists', async () => {
      mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { email: 'test@test.com' } } } });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: { mssv: 'TEST' } });
      
      const mockHistory = [{ events: { event_name: 'E1', semester: 'S1' }, participate_role: 'user', created_at: 'now' }];
      mockQueryBuilder.then.mockImplementationOnce((cb: any) => cb({ data: mockHistory }));
      
      const res = await MeHistoryGET();
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data[0].event_name).toBe('E1');
    });
  });

  describe('me/class-lookup/route', () => {
    it('GET should return 401 if no auth', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const res = await ClassLookupGET();
      expect(res.status).toBe(401);
    });

    it('GET should return delegate status', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ 
        data: { class_id: 'C1', expires_at: new Date(Date.now() + 86400000).toISOString() } 
      });
      const res = await ClassLookupGET();
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.isDelegate).toBe(true);
    });
  });

  describe('me/class-lookup/students/route', () => {
    it('GET should return 403 if not delegate', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null });
      const req = new Request('http://localhost');
      const res = await ClassStudentsGET(req);
      expect(res.status).toBe(403);
    });

    it('GET should return students list if delegate', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: { class_id: 'C1' } });
      
      // limit() and in() are awaited, so they hit .then()
      // First is classStudents, second is checkIns
      mockQueryBuilder.then
        .mockImplementationOnce((cb: any) => cb({ data: [{ mssv: 'S1' }] }))
        .mockImplementationOnce((cb: any) => cb({ data: [{ mssv: 'S1' }] }));
      
      const req = new Request('http://localhost');
      const res = await ClassStudentsGET(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.students[0].mssv).toBe('S1');
    });
  });

  describe('me/class-lookup/history/route', () => {
    it('GET should return 400 if mssv missing', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: { class_id: 'C1' } });
      const req = new Request('http://localhost');
      const res = await ClassHistoryGET(req);
      expect(res.status).toBe(400);
    });

    it('GET should return 403 if cross-class lookup', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: { class_id: 'C1' } }); // delegate
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: { class_id: 'C2' } }); // target
      const req = new Request('http://localhost?mssv=123');
      const res = await ClassHistoryGET(req);
      expect(res.status).toBe(403);
    });

    it('GET should return 401 when not authenticated', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const req = new Request('http://localhost');
      const res = await ClassHistoryGET(req);
      expect(res.status).toBe(401);
    });

    it('GET should return non-200 when user has no delegate role', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'n22dccn001@student.ptithcm.edu.vn', tier: 'student', isSuperAdmin: false, isEventAdmin: false });
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const req = new Request('http://localhost');
      const res = await ClassHistoryGET(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('rooms/route', () => {
    it('GET should return rooms', async () => {
      mockQueryBuilder.then.mockImplementationOnce((cb: any) => cb({ data: [{ room_name: 'R1' }] }));
      const res = await RoomsGET();
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('POST should create room if superadmin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'sa@test.com' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { email: 'sa@test.com' } }) // superadmin check
        .mockResolvedValueOnce({ data: { room_name: 'R1' } }); // insert
      
      const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ room_name: 'R1' }) });
      const res = await RoomsPOST(req);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('rooms/[id]/route', () => {
    it('PATCH should update room', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'sa@test.com' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { email: 'sa@test.com' } })
        .mockResolvedValueOnce({ data: { room_name: 'R2' } });
        
      const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ room_name: 'R2' }) });
      const res = await RoomPATCH(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('DELETE should delete room', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'sa@test.com' });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: { email: 'sa@test.com' } });
      mockQueryBuilder.then.mockImplementationOnce((cb: any) => cb({ error: null }));
      
      const req = new Request('http://localhost', { method: 'DELETE' });
      const res = await RoomDELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('events/[id]/register/route', () => {
    it('GET should return event and registration info', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { event_id: '1' } }) // event
        .mockResolvedValueOnce({ data: { event_id: '1', email: 'test@test.com' } }) // myReg
        .mockResolvedValueOnce({ data: null }); // penalty
        
      mockQueryBuilder.then.mockImplementationOnce((cb: any) => cb({ count: 5 })); // count query
      
      const req = new Request('http://localhost');
      const res = await RegisterGET(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('POST should fail if blacklisted', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { event_id: '1' } }) // event
        .mockResolvedValueOnce({ data: { is_blacklisted: true, missed_count: 3 } }); // penalty
        
      const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) });
      const res = await RegisterPOST(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.is_blacklisted).toBe(true);
    });

    it('POST should succeed if not blacklisted', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { event_id: '1' } }) // event
        .mockResolvedValueOnce({ data: null }) // penalty
        .mockResolvedValueOnce({ data: { full_name: 'Test' } }) // user profile
        .mockResolvedValueOnce({ data: { event_id: '1' }, error: null }); // reg upsert
        
      const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) });
      const res = await RegisterPOST(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('DELETE should return 401 when not authenticated', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const req = new Request('http://localhost', { method: 'DELETE' });
      const res = await RegisterDELETE(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(401);
    });

    it('DELETE should return 200 and cancel registration', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'n22dccn001@student.ptithcm.edu.vn', tier: 'student' });
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.then.mockImplementationOnce((cb: any) => cb({ error: null }));
      
      const req = new Request('http://localhost', { method: 'DELETE' });
      const res = await RegisterDELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.message).toContain('hủy');
    });

    it('DELETE should return 500 on DB error', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'n22dccn001@student.ptithcm.edu.vn', tier: 'student' });
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.then.mockImplementationOnce((cb: any) => cb({ error: { message: 'FK err' } }));
      
      const req = new Request('http://localhost', { method: 'DELETE' });
      const res = await RegisterDELETE(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(500);
    });
  });

  describe('events/[id]/ratings/route', () => {
    it('POST should fail if tier not allowed', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com', tier: 'user' });
      const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ stars: 5 }) });
      const res = await RatingsPOST(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(403);
    });

    it('POST should succeed if tier allowed', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com', tier: 'ctsv' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { organization_unit: 'OU' } }) // proposal
        .mockResolvedValueOnce({ data: { id: 'r1' } }); // upsert
        
      const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ stars: 5 }) });
      const res = await RatingsPOST(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('events/[id]/reconcile-attendance/route', () => {
    it('POST should reconcile attendance and handle absent students', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'sa@test.com', isSuperAdmin: true });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { event_name: 'E1' } }) // event
        .mockResolvedValueOnce({ data: { missed_count: 2 } }); // existing penalty for absent
        
      mockQueryBuilder.then
        .mockImplementationOnce((cb: any) => cb({ data: [{ mssv: 'S1' }, { mssv: 'S2' }] })) // registrations
        .mockImplementationOnce((cb: any) => cb({ data: [{ mssv: 'S1' }] })) // checkins
        .mockImplementation((cb: any) => cb({ error: null })); // update & upsert
        
      (blacklistLogic.reconcileAttendance as jest.Mock).mockReturnValueOnce({
        attended: [{ mssv: 'S1' }],
        absent: [{ mssv: 'S2' }]
      });

      const req = new Request('http://localhost', { method: 'POST' });
      const res = await ReconcilePOST(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();
      
      expect(data.success).toBe(true);
      expect(data.data.newlyBlacklisted).toContain('S2'); // S2 missed_count becomes 3
    });
  });

  describe('Rooms POST — extra branches', () => {
    it('POST 409 duplicate room name', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'dup' } });

      const req = new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({ room_name: 'Hội trường A' }),
      });
      const res = await RoomsPOST(req);
      expect(res.status).toBe(409);
    });

    it('POST 500 on other insert error', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42000', message: 'other' } });

      const req = new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({ room_name: 'Room Z' }),
      });
      const res = await RoomsPOST(req);
      expect(res.status).toBe(500);
    });

    it('POST 400 for empty room name', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null });

      const req = new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({ room_name: '' }),
      });
      const res = await RoomsPOST(req);
      expect(res.status).toBe(400);
    });

    it('GET 500 on error', async () => {
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) => resolve({ data: null, error: { message: 'db err' } }));
      const res = await RoomsGET();
      expect(res.status).toBe(500);
    });
  });

  describe('Rooms/[id] — extra branches', () => {
    const p = (id: string) => ({ params: Promise.resolve({ id }) });

    it('PATCH 409 duplicate room name', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null }) // super_admin
        .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'dup' } }); // update

      const req = new Request('http://l', {
        method: 'PATCH',
        body: JSON.stringify({ room_name: 'Dup Room', capacity: 50 }),
      });
      const res = await RoomPATCH(req, p('r1'));
      expect(res.status).toBe(409);
    });

    it('PATCH 500 on other error', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42000', message: 'other' } });

      const req = new Request('http://l', {
        method: 'PATCH',
        body: JSON.stringify({ location: 'Building B' }),
      });
      const res = await RoomPATCH(req, p('r1'));
      expect(res.status).toBe(500);
    });

    it('PATCH 200 updates room successfully', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'r1', room_name: 'Updated' }, error: null });

      const req = new Request('http://l', {
        method: 'PATCH',
        body: JSON.stringify({ room_name: 'Updated', capacity: 200 }),
      });
      const res = await RoomPATCH(req, p('r1'));
      expect(res.status).toBe(200);
    });

    it('DELETE 500 on error', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null });
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) => resolve({ error: { message: 'FK constraint' } }));

      const req = new Request('http://l', { method: 'DELETE' });
      const res = await RoomDELETE(req, p('r1'));
      expect(res.status).toBe(500);
    });

    it('DELETE 200 success', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn' });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: { email: 'admin@ptithcm.edu.vn' }, error: null });
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) => resolve({ error: null }));

      const req = new Request('http://l', { method: 'DELETE' });
      const res = await RoomDELETE(req, p('r1'));
      expect(res.status).toBe(200);
    });
  });
});
