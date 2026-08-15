/**
 * Whitebox tests for auth/demo route (354 lines — largest route file)
 * Covers: POST login with all tiers, dynamic LCD/CLB unit login, DELETE logout
 */

jest.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true })
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  }),
}));

// Polyfill NextResponse.cookies for test env
import { NextResponse } from 'next/server';
const origJson = NextResponse.json.bind(NextResponse);
jest.spyOn(NextResponse, 'json').mockImplementation((...args: any[]) => {
  const resp = origJson(...args);
  if (!resp.cookies || typeof resp.cookies.set !== 'function') {
    (resp as any).cookies = { set: jest.fn(), delete: jest.fn(), get: jest.fn() };
  }
  return resp;
});

import { POST, DELETE, DEMO_PROFILES } from '@/app/api/auth/demo/route';

describe('Auth Demo API — POST login', () => {
  test('logs in as user tier → redirects to /', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'user' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile.tier).toBe('user');
    expect(body.redirectUrl).toBe('/');
  });

  test('logs in as checker → redirects to /scanner', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'checker' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('checker');
    expect(body.redirectUrl).toBe('/scanner');
  });

  test('logs in as event_admin → redirects to /admin/proposals', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'event_admin' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('event_admin');
    expect(body.redirectUrl).toBe('/admin/proposals');
  });

  test('logs in as youth_union → redirects to /admin/proposals', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'youth_union' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('youth_union');
    expect(body.redirectUrl).toBe('/admin/proposals');
  });

  test('logs in as ctsv → redirects to /admin/proposals', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'ctsv' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('ctsv');
    expect(body.redirectUrl).toBe('/admin/proposals');
  });

  test('logs in as facility → redirects to /admin/proposals', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'facility' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('facility');
    expect(body.redirectUrl).toBe('/admin/proposals');
  });

  test('logs in as super_admin → redirects to /super-admin', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'super_admin' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('super_admin');
    expect(body.redirectUrl).toBe('/super-admin');
  });

  // LCĐ named profiles
  test('logs in as lcdcntt (named LCĐ CNTT profile)', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'lcdcntt' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.email).toBe('lcdcntt@student.ptithcm.edu.vn');
    expect(body.profile.tier).toBe('event_admin');
  });

  test('logs in as lcdvt (named LCĐ Viễn thông profile)', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'lcdvt' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.full_name).toContain('Viễn thông');
  });

  test('logs in as lcdqtkd (named LCĐ QTKD profile)', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'lcdqtkd' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.email).toBe('lcdqtkd@student.ptithcm.edu.vn');
  });

  // Dynamic LCD/CLB/DOI profiles (not in DEMO_PROFILES)
  test('dynamic lcd unit creates event_admin profile', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'lcd.newunit' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('event_admin');
    expect(body.profile.email).toBe('lcd.newunit@student.ptithcm.edu.vn');
  });

  test('dynamic clb unit creates event_admin profile', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'clb.robotics' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('event_admin');
    expect(body.profile.email).toBe('clb.robotics@student.ptithcm.edu.vn');
  });

  test('dynamic doi unit creates event_admin profile', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'doi.vannghe2' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('event_admin');
  });

  test('unknown role falls back to user profile', async () => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role: 'unknown_role_xyz' }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.profile.tier).toBe('user');
    expect(body.profile.mssv).toBe('N22DCCN001');
  });

  test('returns 500 on invalid JSON body', async () => {
    const req = new Request('http://l', { method: 'POST', body: 'invalid-json' });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  // Cover ALL named CLB/DOI profiles (lines 103-231 in route.ts)
  const allClbDoi = [
    'clb.itmc', 'clb.antoanthongtin', 'clb.tienganh', 'doivannghe',
    'clb.guitar', 'doisinhvientinhnguyen', 'clb.ketnoi', 'clb.truyenthongcmc',
    'clb.37dosinhvien', 'clb.bma', 'clb.bongchuyen', 'clbbongda',
    'clb.bongro', 'clb.vovinam', 'clb.co', 'clb.caulong',
  ];

  test.each(allClbDoi)('logs in as %s profile correctly', async (role) => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile.tier).toBe('event_admin');
    expect(body.redirectUrl).toBe('/admin/proposals');
  });

  // Cover all LCĐ named profiles  
  const allLcd = ['lcdcntt', 'lcdcndpt', 'lcdattt', 'lcdvt', 'lcddt', 'lcdqtkd', 'lcdmkt', 'lcdketoan'];

  test.each(allLcd)('logs in as %s LCD profile correctly', async (role) => {
    const req = new Request('http://l', { method: 'POST', body: JSON.stringify({ role }) });
    const res = await POST(req);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile.tier).toBe('event_admin');
  });
});

describe('Auth Demo API — DELETE logout', () => {
  test('successfully logs out and clears cookie', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe('DEMO_PROFILES static data', () => {
  test('contains all expected tier profiles', () => {
    expect(DEMO_PROFILES.user).toBeDefined();
    expect(DEMO_PROFILES.checker).toBeDefined();
    expect(DEMO_PROFILES.event_admin).toBeDefined();
    expect(DEMO_PROFILES.youth_union).toBeDefined();
    expect(DEMO_PROFILES.ctsv).toBeDefined();
    expect(DEMO_PROFILES.facility).toBeDefined();
    expect(DEMO_PROFILES.super_admin).toBeDefined();
  });

  test('all LCĐ profiles have event_admin tier', () => {
    const lcdKeys = ['lcdcntt', 'lcdcndpt', 'lcdattt', 'lcdvt', 'lcddt', 'lcdqtkd', 'lcdmkt', 'lcdketoan'];
    lcdKeys.forEach(key => {
      expect(DEMO_PROFILES[key]?.tier).toBe('event_admin');
    });
  });

  test('user profile has correct PTIT email format', () => {
    expect(DEMO_PROFILES.user.email).toMatch(/@student\.ptithcm\.edu\.vn$/);
    expect(DEMO_PROFILES.user.mssv).toMatch(/^N\d{2}[A-Z]{4}\d{3}$/);
  });
});
