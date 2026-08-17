import { NextRequest } from 'next/server';
import { GET as getProposals, POST as postProposals } from '@/app/api/proposals/route';
import { GET as getProposalById } from '@/app/api/proposals/[id]/route';
import { POST as approveProposal } from '@/app/api/proposals/[id]/approve/route';
import { POST as rejectProposal } from '@/app/api/proposals/[id]/reject/route';
import { GET as checkConflict } from '@/app/api/proposals/check-conflict/route';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/supabase/auth-helper', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true })
}));

// Provide minimal mock for utils so we don't depend on actual implementation causing side effects if not needed,
// but the instructions say "Test ALL branches ... room conflict detection ... auto-event creation". We can let real logic run for `calculateProposalStages` and `summarizeUnitRatings`.
jest.mock('@/lib/utils/rating-logic', () => ({
  summarizeUnitRatings: jest.fn().mockReturnValue({ rating: 'good' }),
}));

jest.mock('@/lib/utils/proposal-logic', () => ({
  calculateProposalStages: jest.fn().mockReturnValue({ requiresCtsv: true, requiresFacility: true }),
  getNextStage: jest.fn().mockImplementation((current) => current === 'ctsv' ? 'facility' : 'approved'),
  getStageLabel: jest.fn().mockReturnValue('Giai doan test'),
}));

jest.mock('@/lib/security/sanitizer', () => ({
  sanitizeInput: jest.fn((str) => str),
}));

describe('Proposals API Routes', () => {
  let mockSupabaseQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup a reusable chainable mock
    mockSupabaseQuery = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: {}, error: null }),
      then: jest.fn(),
    };

    // Fix `then` to allow awaiting the chain directly
    mockSupabaseQuery.then.mockImplementation((resolve) => resolve({ data: [], error: null }));

    (createClient as jest.Mock).mockResolvedValue({
      from: jest.fn().mockReturnValue(mockSupabaseQuery),
    });

    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'student@st.ptithcm.edu.vn',
      tier: 'student',
      isSuperAdmin: false,
    });
  });

  const createReq = (url: string, method = 'GET', body?: any) => {
    return new NextRequest('http://localhost' + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  describe('GET /api/proposals', () => {
    it('returns 401 if unauthorized', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const req = createReq('/api/proposals');
      const res = await getProposals(req);
      expect(res.status).toBe(401);
    });

    it('returns proposals for student (filtered by email)', async () => {
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [{ id: 1, created_by: 'student@st.ptithcm.edu.vn' }], error: null })); // For event_proposals
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null })); // For unit_ratings

      const req = createReq('/api/proposals');
      const res = await getProposals(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('created_by', 'student@st.ptithcm.edu.vn');
    });

    it('returns all proposals for approver (super admin)', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({
        email: 'admin@ptithcm.edu.vn',
        isSuperAdmin: true,
      });
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [{ id: 1 }], error: null }));
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null }));
      
      const req = createReq('/api/proposals?stage=ctsv&status=pending');
      const res = await getProposals(req);
      expect(res.status).toBe(200);
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('current_stage', 'ctsv');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('status', 'pending');
      // Should not filter by created_by
      expect(mockSupabaseQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything());
    });

    it('returns 500 on db error', async () => {
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: null, error: { message: 'db error' } }));
      const req = createReq('/api/proposals');
      const res = await getProposals(req);
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/proposals', () => {
    it('returns 401 if unauthorized', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const req = createReq('/api/proposals', 'POST', {});
      const res = await postProposals(req);
      expect(res.status).toBe(401);
    });

    it('validates missing title', async () => {
      const req = createReq('/api/proposals', 'POST', { title: '' });
      const res = await postProposals(req);
      expect(res.status).toBe(400);
    });

    it('validates missing date/time', async () => {
      const req = createReq('/api/proposals', 'POST', { title: 'Test' });
      const res = await postProposals(req);
      expect(res.status).toBe(400);
    });

    it('validates invalid date logic (end < start)', async () => {
      const req = createReq('/api/proposals', 'POST', {
        title: 'Test',
        start_date: '2029-01-02', start_time: '10:00',
        end_date: '2029-01-01', end_time: '10:00'
      });
      const res = await postProposals(req);
      expect(res.status).toBe(400);
    });

    it('rejects past date proposals', async () => {
      const req = createReq('/api/proposals', 'POST', {
        title: 'Past Event',
        start_date: '2020-01-01', start_time: '10:00',
        end_date: '2020-01-01', end_time: '12:00'
      });
      const res = await postProposals(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('không thể ở trong quá khứ');
    });

    it('detects room conflicts', async () => {
      // Return a conflict when querying for room
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({
        data: [{ id: 1, title: 'Conflict Event', start_datetime: '2029-01-01T10:00:00Z' }],
        error: null
      }));

      const req = createReq('/api/proposals', 'POST', {
        title: 'Test',
        start_date: '2029-01-01', start_time: '10:00',
        end_date: '2029-01-01', end_time: '12:00',
        room_id: 'room1',
        room_name: 'Room 1'
      });
      const res = await postProposals(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('đã bị trùng lịch');
    });

    it('successfully creates proposal and logs it', async () => {
      // Mock no conflict
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null })); // For conflict check
      
      // Mock single return for insert
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: { id: 10 }, error: null });

      const req = createReq('/api/proposals', 'POST', {
        title: 'Success Event',
        start_date: '2029-01-01', start_time: '10:00',
        end_date: '2029-01-01', end_time: '12:00',
        participant_count: 50,
      });
      const res = await postProposals(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(10);
      // Ensure logs was inserted
      expect(mockSupabaseQuery.insert).toHaveBeenCalledTimes(2); // proposal + log
    });
    
    it('returns 500 on db insert error', async () => {
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null })); // no conflict
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });
      const req = createReq('/api/proposals', 'POST', {
        title: 'Test', start_date: '2029-01-01', start_time: '10:00', end_date: '2029-01-01', end_time: '12:00'
      });
      const res = await postProposals(req);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/proposals/[id]', () => {
    it('returns 401 if unauthorized', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const req = createReq('/api/proposals/1');
      const res = await getProposalById(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(401);
    });

    it('returns 404 if proposal not found', async () => {
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
      const req = createReq('/api/proposals/1');
      const res = await getProposalById(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(404);
    });

    it('returns proposal with logs and ratings', async () => {
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: { id: '1', organization_unit: 'Unit 1', created_event_id: 'ev1' }, error: null }); // Proposal
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [{ action: 'comment' }], error: null })); // logs
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null })); // allRatings
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null })); // eventRatings

      const req = createReq('/api/proposals/1');
      const res = await getProposalById(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.logs.length).toBe(1);
    });
  });

  describe('POST /api/proposals/[id]/approve', () => {
    it('returns 401 if unauthorized', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce(null);
      const req = createReq('/api/proposals/1/approve', 'POST');
      const res = await approveProposal(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(401);
    });

    it('returns 404 if proposal not found', async () => {
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
      const req = createReq('/api/proposals/1/approve', 'POST');
      const res = await approveProposal(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(404);
    });

    it('returns 400 if already approved/rejected', async () => {
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: { status: 'approved' }, error: null });
      const req = createReq('/api/proposals/1/approve', 'POST');
      const res = await approveProposal(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(400);
    });

    it('returns 403 if lack permission', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'student@test.com', tier: 'student' });
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: { status: 'pending', current_stage: 'ctsv' }, error: null });
      
      const req = createReq('/api/proposals/1/approve', 'POST');
      const res = await approveProposal(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(403);
    });

    it('advances stage and logs if not final stage', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'ctsv@test.com', tier: 'ctsv' });
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { id: '1', status: 'pending', current_stage: 'ctsv' }, error: null }) // select proposal
        .mockResolvedValueOnce({ data: { id: '1', current_stage: 'facility' }, error: null }); // update proposal

      const req = createReq('/api/proposals/1/approve', 'POST', { notes: 'Ok' });
      const res = await approveProposal(req, { params: Promise.resolve({ id: '1' }) });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain('Đã duyệt');
      expect(mockSupabaseQuery.insert).toHaveBeenCalledTimes(1); // logs
      expect(mockSupabaseQuery.update).toHaveBeenCalledTimes(1); // proposal
    });

    it('auto-creates event and assigns role if final stage', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn', isSuperAdmin: true });
      // Change getNextStage mock to return 'approved' for this test
      const { getNextStage } = require('@/lib/utils/proposal-logic');
      getNextStage.mockReturnValueOnce('approved');

      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { id: '1', status: 'pending', current_stage: 'facility', created_by: 'test@ptithcm.edu.vn' }, error: null }) // select proposal
        .mockResolvedValueOnce({ data: { event_id: 'ev-123' }, error: null }) // insert event
        .mockResolvedValueOnce({ data: { id: '1', status: 'approved' }, error: null }); // update proposal

      const req = createReq('/api/proposals/1/approve', 'POST');
      const res = await approveProposal(req, { params: Promise.resolve({ id: '1' }) });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('tự động tạo sự kiện');
      
      // Should have inserted logs, event, event_roles
      expect(mockSupabaseQuery.insert).toHaveBeenCalledTimes(3); 
    });
    
    it('returns 500 if event creation fails on final stage', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'admin@ptithcm.edu.vn', isSuperAdmin: true });
      const { getNextStage } = require('@/lib/utils/proposal-logic');
      getNextStage.mockReturnValueOnce('approved');

      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { id: '1', status: 'pending', current_stage: 'facility' }, error: null }) // select proposal
        .mockResolvedValueOnce({ data: null, error: { message: 'db error' } }); // insert event fails

      const req = createReq('/api/proposals/1/approve', 'POST');
      const res = await approveProposal(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/proposals/[id]/reject', () => {
    it('returns 403 if lack permission to reject', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'student@test.com', tier: 'student' });
      mockSupabaseQuery.single.mockResolvedValueOnce({ data: { status: 'pending', current_stage: 'ctsv' }, error: null });
      
      const req = createReq('/api/proposals/1/reject', 'POST', { reason: 'No' });
      const res = await rejectProposal(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(403);
    });

    it('rejects successfully and updates proposal', async () => {
      (getAuthContext as jest.Mock).mockResolvedValueOnce({ email: 'ctsv@test.com', tier: 'ctsv' });
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { id: '1', status: 'pending', current_stage: 'ctsv' }, error: null }) // select
        .mockResolvedValueOnce({ data: { id: '1', status: 'rejected' }, error: null }); // update

      const req = createReq('/api/proposals/1/reject', 'POST', { reason: 'No budget' });
      const res = await rejectProposal(req, { params: Promise.resolve({ id: '1' }) });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockSupabaseQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
    });
  });

  describe('GET /api/proposals/check-conflict', () => {
    it('returns no conflict if params missing', async () => {
      const req = createReq('/api/proposals/check-conflict');
      const res = await checkConflict(req);
      const data = await res.json();
      expect(data.conflict).toBe(false);
    });

    it('returns no conflict if invalid date', async () => {
      const req = createReq('/api/proposals/check-conflict?room_id=1&start=abc&end=def');
      const res = await checkConflict(req);
      const data = await res.json();
      expect(data.conflict).toBe(false);
    });

    it('finds conflict successfully', async () => {
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [{ id: '99', title: 'Existing' }], error: null }));
      const req = createReq('/api/proposals/check-conflict?room_id=1&start=2025-01-01T10:00:00Z&end=2025-01-01T12:00:00Z');
      const res = await checkConflict(req);
      const data = await res.json();
      expect(data.conflict).toBe(true);
      expect(data.conflictingProposal.id).toBe('99');
    });

    it('returns false if no conflicts found', async () => {
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null }));
      const req = createReq('/api/proposals/check-conflict?room_id=1&start=2025-01-01T10:00:00Z&end=2025-01-01T12:00:00Z');
      const res = await checkConflict(req);
      const data = await res.json();
      expect(data.conflict).toBe(false);
    });
    
    it('returns 500 on db error', async () => {
      mockSupabaseQuery.then.mockImplementationOnce((resolve: any) => resolve({ data: null, error: { message: 'db err' } }));
      const req = createReq('/api/proposals/check-conflict?room_id=1&start=2025-01-01T10:00:00Z&end=2025-01-01T12:00:00Z');
      const res = await checkConflict(req);
      expect(res.status).toBe(500);
    });
  });
});
