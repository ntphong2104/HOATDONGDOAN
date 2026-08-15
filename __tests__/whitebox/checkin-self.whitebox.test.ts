import { POST as selfCheckin } from '@/app/api/checkin/self/route';
import { cookies } from 'next/headers';
import { verifyDynamicToken } from '@/lib/utils/dynamic-qr';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isEventPastDeadline } from '@/lib/utils/event-logic';

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

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockImplementation(() => Promise.resolve(mockSupabase)),
}));

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

jest.mock('@/lib/utils/dynamic-qr', () => ({
  verifyDynamicToken: jest.fn(),
}));

jest.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, remaining: 4, resetInSeconds: 10, limit: 5 }),
}));

jest.mock('@/lib/utils/event-logic', () => ({
  isEventPastDeadline: jest.fn().mockReturnValue(false),
}));

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

const mockVerify = verifyDynamicToken as jest.Mock;
const mockRateLimit = checkRateLimit as jest.Mock;
const mockDeadline = isEventPastDeadline as jest.Mock;

describe('/api/checkin/self additional branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetInSeconds: 10, limit: 5 });
    mockDeadline.mockReturnValue(false);

    (cookies().get as jest.Mock).mockReturnValue({ value: JSON.stringify({ email: 'n22dccn001@student.ptithcm.edu.vn' }) });
  });

  test('returns 503 during maintenance mode', async () => {
    mockQueryBuilder.single.mockResolvedValueOnce({ data: { value: true }, error: null });

    const req = new Request('http://l', {
      method: 'POST',
      body: JSON.stringify({ token: 'e1:abc:123' }),
    });
    const res = await selfCheckin(req);
    expect(res.status).toBe(503);
  });

  test('returns 400 for expired dynamic QR token', async () => {
    mockQueryBuilder.single.mockResolvedValueOnce({ data: { value: false }, error: null });
    mockVerify.mockReturnValue({ valid: false });

    const req = new Request('http://l', {
      method: 'POST',
      body: JSON.stringify({ token: 'e1:abc:123' }),
    });
    const res = await selfCheckin(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('hết hạn');
  });

  test('returns 409 for duplicate check-in', async () => {
    mockQueryBuilder.single
      .mockResolvedValueOnce({ data: { value: false }, error: null })
      .mockResolvedValueOnce({ data: { mssv: 'N22DCCN001', full_name: 'An', class_id: 'D22' }, error: null })
      .mockResolvedValueOnce({ data: { event_id: 'e1', event_name: 'Test', status: 'active', is_active: true }, error: null })
      .mockResolvedValueOnce({ data: { id: 'existing' }, error: null });

    mockVerify.mockReturnValue({ valid: true, role: 'participant' });

    const req = new Request('http://l', {
      method: 'POST',
      body: JSON.stringify({ token: 'e1:abc:123' }),
    });
    const res = await selfCheckin(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.is_duplicate).toBe(true);
  });

  test('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetInSeconds: 5, limit: 5 });

    const req = new Request('http://l', {
      method: 'POST',
      body: JSON.stringify({ token: 'e1:abc:123' }),
    });
    const res = await selfCheckin(req);
    expect(res.status).toBe(429);
  });

  test('returns 400 for invalid token format', async () => {
    mockQueryBuilder.single.mockResolvedValueOnce({ data: { value: false }, error: null });

    const req = new Request('http://l', {
      method: 'POST',
      body: JSON.stringify({ token: 'invalid-no-colons' }),
    });
    const res = await selfCheckin(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 for missing token', async () => {
    mockQueryBuilder.single.mockResolvedValueOnce({ data: { value: false }, error: null });

    const req = new Request('http://l', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await selfCheckin(req);
    expect(res.status).toBe(400);
  });
});
