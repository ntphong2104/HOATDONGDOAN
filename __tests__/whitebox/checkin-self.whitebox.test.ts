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
  maybeSingle: jest.fn((...args: any[]) => mockQueryBuilder.single(...args)),
  then: jest.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
};

const mockSupabase: any = {
  from: jest.fn().mockReturnValue(mockQueryBuilder),
  rpc: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
  auth: {
    signOut: jest.fn().mockResolvedValue({ error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockImplementation(() => Promise.resolve(mockSupabase)),
  createAdminClient: jest.fn().mockImplementation(() => Promise.resolve(mockSupabase)),
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

jest.mock('@/lib/supabase/auth-helper', () => ({
  ...jest.requireActual('@/lib/supabase/auth-helper'),
  getAuthContext: jest.fn().mockResolvedValue({
    email: 'n22dccn001@student.ptithcm.edu.vn',
    isSuperAdmin: false,
    isEventAdmin: false,
    isChecker: false,
    isSecurity: false,
    tier: 'user',
  }),
}));

jest.mock('@/lib/constants/user-profile-store', () => ({
  ...jest.requireActual('@/lib/constants/user-profile-store'),
  getUserProfileExtraWithFallback: jest.fn().mockResolvedValue({ phone: '0987654321' }),
}));

jest.mock('@/lib/utils/event-logic', () => ({
  ...jest.requireActual('@/lib/utils/event-logic'),
  isEventPastDeadline: jest.fn().mockReturnValue(false),
  isEventTooEarlyForCheckin: jest.fn().mockReturnValue(false),
  getEarliestCheckinTime: jest.fn().mockReturnValue('07:15'),
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

let selfClockStep = 0;
let selfDateSpy: jest.SpyInstance<number, []> | null = null;

describe('/api/checkin/self additional branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selfClockStep += 1;
    selfDateSpy = jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000 + selfClockStep * 60_000);
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetInSeconds: 10, limit: 5 });
    mockDeadline.mockReturnValue(false);

    ((cookies as unknown as () => any)().get as jest.Mock).mockReturnValue({ value: JSON.stringify({ email: 'n22dccn001@student.ptithcm.edu.vn', tier: 'user' }) });
  });

  afterEach(() => {
    selfDateSpy?.mockRestore();
    selfDateSpy = null;
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
      .mockResolvedValueOnce({ data: { event_id: 'e1', event_name: 'Test', status: 'active', is_active: true }, error: null })
      .mockResolvedValueOnce({ data: { mssv: 'N22DCCN001', full_name: 'An', class_id: 'D22' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'existing', role_type: 'participant', attended: false }, error: null });

    mockSupabase.rpc.mockResolvedValueOnce({
      data: { success: false, is_duplicate: true },
      error: null,
    });
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
