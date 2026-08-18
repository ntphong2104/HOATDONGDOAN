import { POST } from '@/lib/../app/api/security/handover/route';
import * as authHelper from '@/lib/supabase/auth-helper';
import * as serverSupabase from '@/lib/supabase/server';

jest.mock('@/lib/supabase/auth-helper');
jest.mock('@/lib/supabase/server');

describe('Security Handover API Route (/api/security/handover)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Returns 401 Unauthorized if not logged in', async () => {
    (authHelper.getAuthContext as jest.Mock).mockResolvedValue(null);

    const req = new Request('http://localhost:3000/api/security/handover', {
      method: 'POST',
      body: JSON.stringify({ proposal_id: 'prop-1', action: 'handover' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('Returns 403 Forbidden if user is regular student', async () => {
    (authHelper.getAuthContext as jest.Mock).mockResolvedValue({
      email: 'student@student.ptithcm.edu.vn',
      tier: 'user',
      isSuperAdmin: false,
      isEventAdmin: false,
      isChecker: false,
      isSecurity: false,
    });

    const req = new Request('http://localhost:3000/api/security/handover', {
      method: 'POST',
      body: JSON.stringify({ proposal_id: 'prop-1', action: 'handover' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('Returns 400 Bad Request if missing proposal_id or invalid action', async () => {
    (authHelper.getAuthContext as jest.Mock).mockResolvedValue({
      email: 'baove@ptithcm.edu.vn',
      tier: 'security',
      isSuperAdmin: false,
      isEventAdmin: false,
      isChecker: true,
      isSecurity: true,
    });

    const req = new Request('http://localhost:3000/api/security/handover', {
      method: 'POST',
      body: JSON.stringify({ proposal_id: '', action: 'invalid' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('Successfully updates key handover status to handed_over', async () => {
    (authHelper.getAuthContext as jest.Mock).mockResolvedValue({
      email: 'baove@ptithcm.edu.vn',
      tier: 'security',
      isSuperAdmin: false,
      isEventAdmin: false,
      isChecker: true,
      isSecurity: true,
    });

    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'prop-1',
        key_status: 'handed_over',
        key_handed_at: '2026-08-18T10:00:00.000Z',
        key_handed_by: 'baove@ptithcm.edu.vn',
      },
      error: null,
    });

    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });

    (serverSupabase.createAdminClient as jest.Mock).mockResolvedValue({ from: mockFrom });
    (serverSupabase.createClient as jest.Mock).mockResolvedValue({ from: mockFrom });

    const req = new Request('http://localhost:3000/api/security/handover', {
      method: 'POST',
      body: JSON.stringify({ proposal_id: 'prop-1', action: 'handover' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.key_status).toBe('handed_over');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        key_status: 'handed_over',
        key_handed_by: 'baove@ptithcm.edu.vn',
      })
    );
  });

  test('Successfully updates key handover status to returned', async () => {
    (authHelper.getAuthContext as jest.Mock).mockResolvedValue({
      email: 'baove@ptithcm.edu.vn',
      tier: 'security',
      isSuperAdmin: false,
      isEventAdmin: false,
      isChecker: true,
      isSecurity: true,
    });

    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'prop-1',
        key_status: 'returned',
        key_returned_at: '2026-08-18T12:00:00.000Z',
        key_returned_by: 'baove@ptithcm.edu.vn',
      },
      error: null,
    });

    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });

    (serverSupabase.createAdminClient as jest.Mock).mockResolvedValue({ from: mockFrom });
    (serverSupabase.createClient as jest.Mock).mockResolvedValue({ from: mockFrom });

    const req = new Request('http://localhost:3000/api/security/handover', {
      method: 'POST',
      body: JSON.stringify({ proposal_id: 'prop-1', action: 'return' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.key_status).toBe('returned');
  });
});
