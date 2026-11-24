import crypto from 'crypto';
import { cookies } from 'next/headers';
import { GET } from '@/app/api/me/route';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  invalidateAuthContextCache,
  invalidateTokenCaches,
  getVerifiedUserFromCookies,
} from '@/lib/supabase/auth-helper';
import { invalidateMeResponseCache } from '@/lib/constants/user-profile-store';

jest.mock('next/headers', () => {
  const cookieStore = {
    get: jest.fn().mockReturnValue(undefined),
    getAll: jest.fn().mockReturnValue([]),
  };
  return {
    cookies: jest.fn().mockReturnValue(cookieStore),
  };
});

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

jest.mock('@/lib/constants/officers-store', () => ({
  ROOT_SUPER_ADMIN: 'n22dccn158@student.ptithcm.edu.vn',
  getStoredOfficerRoles: jest.fn().mockResolvedValue([
    { email: 'doanthanhnien@ptithcm.edu.vn', role_tier: 'youth_union', role_title: 'Đoàn Học Viện' },
    { email: 'phongctsv@ptithcm.edu.vn', role_tier: 'ctsv', role_title: 'Phòng CTSV' },
    { email: 'phongquantri@ptithcm.edu.vn', role_tier: 'facility', role_title: 'Phòng CSVC' },
    { email: 'n23dcvt109@student.ptithcm.edu.vn', role_tier: 'office_admin', role_title: 'Admin Văn phòng Đoàn' },
  ]),
}));

describe('Whitebox Tests: GET /api/me (Role Tier Resolution & Error Paths)', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const store = (cookies as jest.Mock)();
    store.get.mockReturnValue(undefined);
    store.getAll.mockReturnValue([]);
    invalidateTokenCaches();
    invalidateAuthContextCache();
    invalidateMeResponseCache();
  });

  const setupMockSupabase = ({
    sessionUser = { email: 'student@ptit.edu.vn' },
    dbUser = { mssv: 'N22DCCN001', full_name: 'Nguyễn Văn An', class_id: 'D22CQCN01-N' },
    superAdmin = null,
    eventRoles = [],
    allEvents = [],
  }: any) => {
    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: sessionUser ? { user: sessionUser } : null },
        }),
        getUser: jest.fn().mockResolvedValue({
          data: { user: sessionUser },
          error: null,
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            upsert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: dbUser, error: null }),
            single: jest.fn().mockResolvedValue({ data: dbUser, error: null }),
          };
        }
        if (table === 'super_admins') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: jest.fn().mockResolvedValue({ data: superAdmin, error: null }),
            single: jest.fn().mockResolvedValue({ data: superAdmin, error: null }),
          };
        }
        if (table === 'event_roles') {
          const res = { data: eventRoles, error: null };
          const chain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            then: (resolve: any, reject?: any) => Promise.resolve(res).then(resolve, reject),
          };
          return chain;
        }
        if (table === 'events') {
          const res = { data: allEvents, error: null };
          const chain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            order: jest.fn().mockResolvedValue(res),
            then: (resolve: any, reject?: any) => Promise.resolve(res).then(resolve, reject),
          };
          return chain;
        }
        const defaultChain: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
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

  test('Branch 1: Returns 401 Unauthorized if no active session', async () => {
    setupMockSupabase({ sessionUser: null });

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('Branch 2: Falls back gracefully with 200 if user is not in users table', async () => {
    setupMockSupabase({ dbUser: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('user');
  });

  test('Branch 3: Resolves tier to "super_admin" when user exists in super_admins table', async () => {
    setupMockSupabase({
      superAdmin: { email: 'student@ptit.edu.vn' },
      eventRoles: [{ event_id: 'e1', role_type: 'checker' }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('super_admin');
  });

  test('Branch 4: Keeps student tier as "user" while granting isEventAdmin and managed_events from event_roles', async () => {
    setupMockSupabase({
      superAdmin: null,
      eventRoles: [
        { event_id: 'e1', role_type: 'event_admin', events: { event_name: 'Ngày hội CN' } },
      ],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('checker');
    expect(body.data.isEventAdmin).toBe(true);
    expect(body.data.managed_events).toHaveLength(1);
  });

  test('Branch 5: Resolves tier to "checker" when user only has checker roles', async () => {
    setupMockSupabase({
      superAdmin: null,
      eventRoles: [{ event_id: 'e2', role_type: 'checker', events: { event_name: 'Hiến máu' } }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('checker');
  });

  test('Branch 6: Resolves tier to "user" (regular student) when user has no special roles', async () => {
    setupMockSupabase({
      superAdmin: null,
      eventRoles: [],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('user');
    expect(body.data.managed_events).toEqual([]);
  });

  test('Branch 7: Falls back to default user profile (200) for non-registered non-student user', async () => {
    setupMockSupabase({
      sessionUser: { email: 'random@gmail.com' },
      dbUser: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tier).toBe('user');
  });

  test('Branch 8: Resolves super_admin tier and fetches all managed events', async () => {
    setupMockSupabase({
      sessionUser: { email: 'admin@ptithcm.edu.vn' },
      dbUser: { mssv: 'ADMIN', full_name: 'Admin', class_id: 'BCH' },
      superAdmin: { email: 'admin@ptithcm.edu.vn' },
      allEvents: [{ event_id: 'e1', event_name: 'Event 1' }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('super_admin');
    expect(body.data.managed_events).toHaveLength(1);
  });

  test('Branch 9: Detects youth_union tier from email', async () => {
    setupMockSupabase({
      sessionUser: { email: 'doanthanhnien@ptithcm.edu.vn' },
      dbUser: { mssv: 'CANBO', full_name: 'Đoàn Học Viện', class_id: 'BCH' },
      superAdmin: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('youth_union');
  });

  test('Branch 10: Detects ctsv tier from email', async () => {
    setupMockSupabase({
      sessionUser: { email: 'phongctsv@ptithcm.edu.vn' },
      dbUser: { mssv: 'CANBO', full_name: 'Phòng CTSV', class_id: 'CTSV' },
      superAdmin: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('ctsv');
  });

  test('Branch 11: Detects facility tier from email with quantri keyword', async () => {
    setupMockSupabase({
      sessionUser: { email: 'phongquantri@ptithcm.edu.vn' },
      dbUser: { mssv: 'CANBO', full_name: 'Phòng CSVC', class_id: 'CSVC' },
      superAdmin: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('facility');
  });

  test('Branch 12: office_admin officer is NOT escalated by stale super_admins row', async () => {
    setupMockSupabase({
      sessionUser: { email: 'n23dcvt109@student.ptithcm.edu.vn' },
      dbUser: { mssv: 'N23DCVT109', full_name: 'VÕ VĂN LUẬT', class_id: 'D23CQVT02-N' },
      superAdmin: { email: 'n23dcvt109@student.ptithcm.edu.vn' },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('office_admin');
    expect(body.data.isOfficeAdmin).toBe(true);
    expect(body.data.isSuperAdmin).toBe(false);
    expect(body.data.isEventAdmin).toBe(false);
    expect(body.data.isChecker).toBe(false);
  });

  test('Branch 13: youth_union officer is NOT escalated by stale super_admins row', async () => {
    setupMockSupabase({
      sessionUser: { email: 'doanthanhnien@ptithcm.edu.vn' },
      dbUser: { mssv: 'CANBO', full_name: 'Đoàn Học Viện', class_id: 'BCH' },
      superAdmin: { email: 'doanthanhnien@ptithcm.edu.vn' },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('youth_union');
    expect(body.data.isSuperAdmin).toBe(false);
  });

  test('Branch 14: Returns avatar_url from Google user_metadata.avatar_url and picture fallback', async () => {
    setupMockSupabase({
      sessionUser: {
        email: 'n22dccn158@student.ptithcm.edu.vn',
        user_metadata: {
          full_name: 'NGUYỄN THANH PHONG',
          avatar_url: 'https://lh3.googleusercontent.com/a/avatar-primary=s96-c',
        },
      },
      dbUser: { mssv: 'N22DCCN158', full_name: 'NGUYỄN THANH PHONG', class_id: 'D22CQCN01-N' },
    });

    const res1 = await GET();
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data.avatar_url).toBe('https://lh3.googleusercontent.com/a/avatar-primary=s96-c');

    invalidateMeResponseCache();
    setupMockSupabase({
      sessionUser: {
        email: 'n22dccn002@student.ptithcm.edu.vn',
        user_metadata: {
          picture: 'https://lh3.googleusercontent.com/a/avatar-picture-fallback=s96-c',
        },
      },
      dbUser: { mssv: 'N22DCCN002', full_name: 'Sinh Viên B', class_id: 'D22CQCN01-N' },
    });

    const res2 = await GET();
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.data.avatar_url).toBe('https://lh3.googleusercontent.com/a/avatar-picture-fallback=s96-c');
  });

  test('Branch 15: getVerifiedUserFromCookies preserves avatarUrl and UTF-8 userMetadata across cache-miss and cache-hit', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(
      JSON.stringify({
        sub: 'user-uuid-1',
        email: 'n22dccn158@student.ptithcm.edu.vn',
        role: 'authenticated',
        aud: 'authenticated',
        exp: nowSec + 3600,
        user_metadata: {
          full_name: 'NGUYỄN THANH PHONG',
          avatar_url: 'https://lh3.googleusercontent.com/a/jwt-cache-test=s96-c',
        },
      })
    ).toString('base64url');
    const fakeJwt = `${headerB64}.${payloadB64}.fake-signature`;
    const cookieList = [
      {
        name: 'sb-project-auth-token',
        value: JSON.stringify({ access_token: fakeJwt }),
      },
    ];

    const supabaseMock = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-uuid-1',
              email: 'n22dccn158@student.ptithcm.edu.vn',
              user_metadata: {
                full_name: 'NGUYỄN THANH PHONG',
                avatar_url: 'https://lh3.googleusercontent.com/a/jwt-cache-test=s96-c',
              },
            },
          },
          error: null,
        }),
      },
    };

    const first = await getVerifiedUserFromCookies(supabaseMock, cookieList);
    expect(first).toEqual({
      email: 'n22dccn158@student.ptithcm.edu.vn',
      id: 'user-uuid-1',
      avatarUrl: 'https://lh3.googleusercontent.com/a/jwt-cache-test=s96-c',
      userMetadata: {
        full_name: 'NGUYỄN THANH PHONG',
        avatar_url: 'https://lh3.googleusercontent.com/a/jwt-cache-test=s96-c',
      },
    });
    expect(supabaseMock.auth.getUser).toHaveBeenCalledTimes(1);

    const second = await getVerifiedUserFromCookies(supabaseMock, cookieList);
    expect(second).toEqual(first);
    expect(supabaseMock.auth.getUser).toHaveBeenCalledTimes(1);
  });

  test('Branch 16: getVerifiedUserFromCookies local HS256 fast-path and GET /api/me preserve avatar_url', async () => {
    const prevSecret = process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_SECRET = 'test-hs256-secret-for-avatar-verification';
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(
        JSON.stringify({
          sub: 'user-uuid-hs256',
          email: 'n22dccn158@student.ptithcm.edu.vn',
          role: 'authenticated',
          aud: 'authenticated',
          exp: nowSec + 3600,
          user_metadata: {
            full_name: 'NGUYỄN THANH PHONG',
            avatar_url: 'https://lh3.googleusercontent.com/a/hs256-avatar=s96-c',
          },
        })
      ).toString('base64url');
      const sigB64 = crypto
        .createHmac('sha256', process.env.SUPABASE_JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
      const signedJwt = `${headerB64}.${payloadB64}.${sigB64}`;

      setupMockSupabase({
        sessionUser: null, // Ensures GET /api/me resolves solely via cookie fast-path
        dbUser: { mssv: 'N22DCCN158', full_name: 'NGUYỄN THANH PHONG', class_id: 'D22CQCN01-N' },
      });
      const store = (cookies as jest.Mock)();
      store.getAll.mockReturnValue([
        {
          name: 'sb-project-auth-token',
          value: JSON.stringify({ access_token: signedJwt }),
        },
      ]);

      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.avatar_url).toBe('https://lh3.googleusercontent.com/a/hs256-avatar=s96-c');
      expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();

      // Second request hits verifiedTokenCache (after clearing meResponseCache) and still returns avatar_url
      invalidateMeResponseCache();
      const resCached = await GET();
      expect(resCached.status).toBe(200);
      const bodyCached = await resCached.json();
      expect(bodyCached.data.avatar_url).toBe('https://lh3.googleusercontent.com/a/hs256-avatar=s96-c');
    } finally {
      if (prevSecret === undefined) {
        delete process.env.SUPABASE_JWT_SECRET;
      } else {
        process.env.SUPABASE_JWT_SECRET = prevSecret;
      }
      invalidateTokenCaches();
    }
  });
});
