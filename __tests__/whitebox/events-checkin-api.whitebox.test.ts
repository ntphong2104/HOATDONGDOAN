import { NextRequest, NextResponse } from 'next/server';
import { GET as EventsGET, POST as EventsPOST } from '@/app/api/events/route';
import { GET as EventIdGET, PATCH as EventIdPATCH, DELETE as EventIdDELETE } from '@/app/api/events/[id]/route';
import { GET as CheckinsGET } from '@/app/api/events/[id]/checkins/route';
import { GET as DynamicQrGET } from '@/app/api/events/[id]/dynamic-qr/route';
import { POST as ToggleRegPOST } from '@/app/api/events/[id]/toggle-registration/route';
import { GET as RolesGET, POST as RolesPOST } from '@/app/api/events/[id]/roles/route';
import { DELETE as RoleIdDELETE } from '@/app/api/events/[id]/roles/[roleId]/route';
import { POST as CameraCheckinPOST } from '@/app/api/checkin/route';
import { POST as SelfCheckinPOST } from '@/app/api/checkin/self/route';
import { GET as RatingsGET, POST as RatingsPOST } from '@/app/api/events/[id]/ratings/route';

import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isEventPastDeadline } from '@/lib/utils/event-logic';
import { generateDynamicToken, verifyDynamicToken } from '@/lib/utils/dynamic-qr';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/supabase/auth-helper', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: jest.fn(),
}));

jest.mock('@/lib/utils/event-logic', () => ({
  isEventPastDeadline: jest.fn(),
}));

jest.mock('@/lib/utils/dynamic-qr', () => ({
  generateDynamicToken: jest.fn(),
  verifyDynamicToken: jest.fn(),
}));

const builders: Record<string, any> = {};

const getBuilder = (table: string) => {
  if (!builders[table]) {
    builders[table] = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation(function(this: any, resolve: any) {
        resolve({ data: this.mockData, error: this.mockError });
      }),
      mockData: null,
      mockError: null,
    };
  }
  return builders[table];
};

const mockSupabase = {
  auth: {
    getSession: jest.fn(),
    getUser: jest.fn(),
  },
  from: jest.fn((table: string) => getBuilder(table)),
};

describe('Events API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (checkRateLimit as jest.Mock).mockReturnValue({ allowed: true });
    // Reset builders
    Object.keys(builders).forEach(key => delete builders[key]);
  });

  describe('/api/events (GET)', () => {
    it('returns 401 if not authenticated', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const res = await EventsGET();
      expect(res.status).toBe(401);
    });

    it('returns events for super admin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockData = [{ event_id: '1', status: 'active' }];
      (isEventPastDeadline as jest.Mock).mockReturnValue(false);

      const res = await EventsGET();
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
    });

    it('returns 500 on db error', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockError = { message: 'db error' };
      const res = await EventsGET();
      expect(res.status).toBe(500);
    });

    it('auto-closes expired events', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockData = [{ event_id: '1', status: 'active' }];
      (isEventPastDeadline as jest.Mock).mockReturnValue(true);

      const res = await EventsGET();
      const json = await res.json();
      expect(json.data[0].status).toBe('closed');
    });

    it('filters for event admin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false, email: 'admin@a.com' });
      getBuilder('event_roles').mockData = [{ event_id: '1' }];
      getBuilder('events').mockData = [{ event_id: '1', status: 'active' }];
      (isEventPastDeadline as jest.Mock).mockReturnValue(false);

      const res = await EventsGET();
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(getBuilder('events').in).toHaveBeenCalledWith('event_id', ['1']);
    });
  });

  describe('/api/events (POST)', () => {
    const mockReq = (body: any) => new NextRequest('http://localhost/api/events', { method: 'POST', body: JSON.stringify(body) });

    it('returns 401 if unauth', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const res = await EventsPOST(mockReq({}));
      expect(res.status).toBe(401);
    });

    it('returns 403 if not admin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false, isEventAdmin: false });
      const res = await EventsPOST(mockReq({}));
      expect(res.status).toBe(403);
    });

    it('returns 400 if name empty', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      const res = await EventsPOST(mockReq({ event_name: '' }));
      expect(res.status).toBe(400);
    });

    it('creates event successfully as superadmin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true, email: 'sa@a.com' });
      getBuilder('events').mockData = { event_id: '1' };
      const res = await EventsPOST(mockReq({ event_name: 'Test' }));
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('creates event successfully as eventadmin and assigns role', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false, isEventAdmin: true, email: 'ea@a.com' });
      getBuilder('events').mockData = { event_id: '2' };
      getBuilder('event_roles').mockData = null; // insert
      const res = await EventsPOST(mockReq({ event_name: 'Test 2' }));
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(getBuilder('event_roles').insert).toHaveBeenCalled();
    });

    it('handles db error', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockError = { message: 'db error' };
      const res = await EventsPOST(mockReq({ event_name: 'Test' }));
      expect(res.status).toBe(500);
    });
  });

  describe('/api/events/[id] (GET/PATCH/DELETE)', () => {
    const mockParams = Promise.resolve({ id: '1' });
    const mockReqPATCH = (body: any) => new NextRequest('http://localhost/api/events/1', { method: 'PATCH', body: JSON.stringify(body) });
    const mockReqDELETE = new NextRequest('http://localhost/api/events/1', { method: 'DELETE' });
    const mockReqGET = new NextRequest('http://localhost/api/events/1', { method: 'GET' });

    it('GET returns event', async () => {
      getBuilder('events').mockData = { event_id: '1', status: 'active' };
      (isEventPastDeadline as jest.Mock).mockReturnValue(false);
      const res = await EventIdGET(mockReqGET, { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('GET auto-closes expired event', async () => {
      getBuilder('events').mockData = { event_id: '1', status: 'active' };
      (isEventPastDeadline as jest.Mock).mockReturnValue(true);
      const res = await EventIdGET(mockReqGET, { params: mockParams });
      const json = await res.json();
      expect(json.data.status).toBe('closed');
    });

    it('PATCH updates event', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockData = { event_id: '1', status: 'closed' };
      const res = await EventIdPATCH(mockReqPATCH({ status: 'closed' }), { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('PATCH 401/403', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue(null);
      const res = await EventIdPATCH(mockReqPATCH({}), { params: mockParams });
      expect(res.status).toBe(401);
    });

    it('DELETE success superadmin', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockData = null;
      const res = await EventIdDELETE(mockReqDELETE, { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('DELETE fail eventadmin unauthorized', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: false, isEventAdmin: true, email: 'ea@a.com' });
      getBuilder('event_roles').mockData = null;
      const res = await EventIdDELETE(mockReqDELETE, { params: mockParams });
      expect(res.status).toBe(403);
    });
  });

  describe('/api/events/[id]/checkins (GET)', () => {
    const mockParams = Promise.resolve({ id: '1' });
    const mockReq = new NextRequest('http://localhost/api', { method: 'GET' });

    it('returns 401', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
      const res = await CheckinsGET(mockReq, { params: mockParams });
      expect(res.status).toBe(401);
    });

    it('returns 403', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { user: { email: 'a@a.com' } } } });
      getBuilder('super_admins').mockData = null;
      getBuilder('event_roles').mockData = null;
      const res = await CheckinsGET(mockReq, { params: mockParams });
      expect(res.status).toBe(403);
    });

    it('returns checkins', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { user: { email: 'a@a.com' } } } });
      getBuilder('super_admins').mockData = { email: 'a@a.com' };
      getBuilder('check_ins').mockData = [{ mssv: '123', users: { full_name: 'A' }, participate_role: 'volunteer' }];
      const res = await CheckinsGET(mockReq, { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0].participate_role).toBe('Cộng tác viên');
    });
  });

  describe('/api/events/[id]/dynamic-qr', () => {
    const mockParams = Promise.resolve({ id: '1' });
    const mockReq = new NextRequest('http://localhost/api?role=participant', { method: 'GET' });

    it('success', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockData = { event_id: '1' };
      (generateDynamicToken as jest.Mock).mockReturnValue({ token: 'abc', role: 'participant', expiresInSeconds: 10 });

      const res = await DynamicQrGET(mockReq, { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.token).toBe('abc');
    });
  });

  describe('/api/events/[id]/toggle-registration', () => {
    const mockParams = Promise.resolve({ id: '1' });
    const mockReq = new NextRequest('http://localhost/api', { method: 'POST' });

    it('success toggles', async () => {
      (getAuthContext as jest.Mock).mockResolvedValue({ isSuperAdmin: true });
      getBuilder('events').mockData = { event_id: '1', is_registration_open: true }; // GET event
      
      const res = await ToggleRegPOST(mockReq, { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.is_registration_open).toBe(false);
    });
  });

  describe('/api/checkin (POST camera)', () => {
    const mockReq = (body: any) => new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });

    it('success', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { user: { email: 'scanner@a.com' } } } });
      (checkRateLimit as jest.Mock).mockReturnValue({ allowed: true });
      getBuilder('events').mockData = { event_id: '1', status: 'active' };
      (isEventPastDeadline as jest.Mock).mockReturnValue(false);
      getBuilder('users').mockData = { mssv: 'N123' };
      getBuilder('check_ins').mockData = null; // insert success

      const res = await CameraCheckinPOST(mockReq({ event_id: '1', participate_role: 'participant', mssv: 'N123' }));
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('rate limit', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { user: { email: 'scanner@a.com' } } } });
      (checkRateLimit as jest.Mock).mockReturnValue({ allowed: false, resetInSeconds: 5 });
      const res = await CameraCheckinPOST(mockReq({ event_id: '1', participate_role: 'participant', mssv: 'N123' }));
      expect(res.status).toBe(429);
    });

    it('conflict', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { user: { email: 'scanner@a.com' } } } });
      (checkRateLimit as jest.Mock).mockReturnValue({ allowed: true });
      getBuilder('events').mockData = { event_id: '1', status: 'active' };
      (isEventPastDeadline as jest.Mock).mockReturnValue(false);
      getBuilder('users').mockData = { mssv: 'N123' };
      getBuilder('check_ins').mockError = { code: '23505' }; // conflict

      const res = await CameraCheckinPOST(mockReq({ event_id: '1', participate_role: 'participant', mssv: 'N123' }));
      expect(res.status).toBe(409);
    });
  });

  describe('/api/checkin/self (POST)', () => {
    const mockReq = (body: any) => new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });

    beforeEach(() => {
      (getAuthContext as jest.Mock).mockResolvedValue({
        email: 'std@a.com',
        isSuperAdmin: false,
        isEventAdmin: false,
        isChecker: false,
        tier: 'user',
      });
      (cookies as jest.Mock).mockResolvedValue({ get: () => null });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { email: 'std@a.com' } } });
      (checkRateLimit as jest.Mock).mockReturnValue({ allowed: true });
      getBuilder('system_settings').mockData = { value: false };
    });

    it('success', async () => {
      (verifyDynamicToken as jest.Mock).mockReturnValue({ valid: true, role: 'participant' });
      getBuilder('users').mockData = { mssv: 'N123' };
      getBuilder('events').mockData = { event_id: '1', status: 'active', is_active: true };
      (isEventPastDeadline as jest.Mock).mockReturnValue(false);
      getBuilder('check_ins').mockData = null; // not existing, then insert success
      // Mock insert returning data for single()
      const checkinBuilder = getBuilder('check_ins');
      checkinBuilder.mockData = { id: 1, created_at: 'now' }; 
      checkinBuilder.single
        .mockResolvedValueOnce({ data: null, error: null }) // existing check
        .mockResolvedValueOnce({ data: { created_at: 'now' }, error: null }); // insert return

      const res = await SelfCheckinPOST(mockReq({ token: '1:abc:123' }));
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('duplicate', async () => {
      (verifyDynamicToken as jest.Mock).mockReturnValue({ valid: true, role: 'participant' });
      getBuilder('users').mockData = { mssv: 'N123' };
      getBuilder('events').mockData = { event_id: '1', status: 'active', is_active: true };
      (isEventPastDeadline as jest.Mock).mockReturnValue(false);
      
      const checkinBuilder = getBuilder('check_ins');
      checkinBuilder.single.mockResolvedValueOnce({ data: { id: 1 }, error: null });

      const res = await SelfCheckinPOST(mockReq({ token: '1:abc:123' }));
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.is_duplicate).toBe(true);
    });

    it('maintenance mode', async () => {
      getBuilder('system_settings').mockData = { value: true };
      const res = await SelfCheckinPOST(mockReq({ token: '1:abc:123' }));
      expect(res.status).toBe(503);
    });
  });

  describe('Roles API', () => {
    const mockParams = Promise.resolve({ id: '1', roleId: '2' });
    
    it('GET roles', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: {} } });
      getBuilder('event_roles').mockData = [{ id: 1 }];
      const res = await RolesGET(new NextRequest('http://localhost'), { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('POST roles validation error', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: {} } });
      const res = await RolesPOST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ role_type: 'invalid' }) }), { params: mockParams });
      expect(res.status).toBe(400);
    });

    it('DELETE role', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: {} } });
      const res = await RoleIdDELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: mockParams });
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('GET 401 when no user session', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const res = await RolesGET(new NextRequest('http://localhost'), { params: mockParams });
      expect(res.status).toBe(401);
    });

    it('POST 401 when no user session', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const res = await RolesPOST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ email: 'u@ptit.edu.vn', role_type: 'checker' }) }), { params: mockParams });
      expect(res.status).toBe(401);
    });

    it('POST 400 missing email', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'admin@ptithcm.edu.vn' } } });
      const res = await RolesPOST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ role_type: 'checker' }) }), { params: mockParams });
      expect(res.status).toBe(400);
    });

    it('POST 200 creates role', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'admin@ptithcm.edu.vn' } } });
      getBuilder('event_roles').single.mockResolvedValueOnce({ data: { id: 'r1', role_type: 'event_admin' }, error: null });
      const res = await RolesPOST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ email: 'u@ptit.edu.vn', role_type: 'event_admin' }) }), { params: mockParams });
      expect(res.status).toBe(200);
    });

    it('POST 409 duplicate role', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'admin@ptithcm.edu.vn' } } });
      getBuilder('event_roles').single.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } });
      const res = await RolesPOST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ email: 'u@ptit.edu.vn', role_type: 'checker' }) }), { params: mockParams });
      expect(res.status).toBe(409);
    });

    it('POST 500 on other DB error', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'admin@ptithcm.edu.vn' } } });
      getBuilder('event_roles').single.mockResolvedValueOnce({ data: null, error: { code: '42000', message: 'other' } });
      const res = await RolesPOST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ email: 'u@ptit.edu.vn', role_type: 'checker' }) }), { params: mockParams });
      expect(res.status).toBe(500);
    });
  });

  describe('/api/events/[id]/ratings (GET/POST)', () => {
    const mockParams = Promise.resolve({ id: '1' });
    const mockReqGET = new NextRequest('http://localhost/api/events/1/ratings', { method: 'GET' });
    const mockReqPOST = (body: any) => new NextRequest('http://localhost/api/events/1/ratings', { method: 'POST', body: JSON.stringify(body) });

    it('GET 500 on DB error', async () => {
      getBuilder('unit_ratings').mockError = { message: 'fail' };
      const res = await RatingsGET(mockReqGET, { params: mockParams });
      expect(res.status).toBe(500);
    });

    it('GET 200 with data', async () => {
      getBuilder('unit_ratings').mockData = [{ stars: 5 }];
      getBuilder('unit_ratings').mockError = null;
      const res = await RatingsGET(mockReqGET, { params: mockParams });
      expect(res.status).toBe(200);
    });

    it('POST 401 unauthenticated', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const res = await RatingsPOST(mockReqPOST({ stars: 5 }), { params: mockParams });
      expect(res.status).toBe(401);
    });

    it('POST 403 for non-approver tier', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'u@student.ptithcm.edu.vn', tier: 'student', isSuperAdmin: false });
      const res = await RatingsPOST(mockReqPOST({ stars: 5 }), { params: mockParams });
      expect(res.status).toBe(403);
    });

    it('POST 400 for invalid stars (0)', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'a@ptithcm.edu.vn', tier: 'youth_union', isSuperAdmin: false });
      const res = await RatingsPOST(mockReqPOST({ stars: 0 }), { params: mockParams });
      expect(res.status).toBe(400);
    });

    it('POST 400 for invalid stars (6)', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'a@ptithcm.edu.vn', tier: 'ctsv', isSuperAdmin: false });
      const res = await RatingsPOST(mockReqPOST({ stars: 6 }), { params: mockParams });
      expect(res.status).toBe(400);
    });

    it('POST 200 with org_unit from proposal fallback', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'a@ptithcm.edu.vn', tier: 'ctsv', isSuperAdmin: false });
      
      const proposalBuilder = getBuilder('event_proposals');
      proposalBuilder.single.mockResolvedValueOnce({ data: { id: 'p1', organization_unit: 'CLB ITMC' }, error: null });

      const ratingBuilder = getBuilder('unit_ratings');
      ratingBuilder.single.mockResolvedValueOnce({ data: { id: 'r1', stars: 4 }, error: null });

      const res = await RatingsPOST(mockReqPOST({ stars: 4, feedback: 'Tốt' }), { params: mockParams });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('POST 200 fallback to event.created_by when no proposal', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'a@ptithcm.edu.vn', tier: 'facility', isSuperAdmin: false });
      
      const proposalBuilder = getBuilder('event_proposals');
      proposalBuilder.single.mockResolvedValueOnce({ data: null, error: null });

      const eventBuilder = getBuilder('events');
      eventBuilder.single.mockResolvedValueOnce({ data: { created_by: 'test@ptit.edu.vn' }, error: null });

      const ratingBuilder = getBuilder('unit_ratings');
      ratingBuilder.single.mockResolvedValueOnce({ data: { id: 'r1' }, error: null });

      const res = await RatingsPOST(mockReqPOST({ stars: 3 }), { params: mockParams });
      expect(res.status).toBe(200);
    });

    it('POST 500 on upsert error', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'a@ptithcm.edu.vn', tier: 'super_admin', isSuperAdmin: true });
      
      const ratingBuilder = getBuilder('unit_ratings');
      ratingBuilder.single.mockResolvedValueOnce({ data: null, error: { message: 'conflict' } });

      const res = await RatingsPOST(mockReqPOST({ stars: 5, organization_unit: 'U', proposal_id: 'p1' }), { params: mockParams });
      expect(res.status).toBe(500);
    });

    it('POST with org_unit provided skips lookup', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'a@ptithcm.edu.vn', tier: 'youth_union', isSuperAdmin: false });
      
      const ratingBuilder = getBuilder('unit_ratings');
      ratingBuilder.single.mockResolvedValueOnce({ data: { id: 'r1', stars: 5 }, error: null });

      const res = await RatingsPOST(mockReqPOST({ stars: 5, organization_unit: 'CLB BMA', proposal_id: 'pp' }), { params: mockParams });
      expect(res.status).toBe(200);
    });
  });
});
