import React from 'react';
import { render, act } from '@testing-library/react';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import {
  sanitizeRedirectPath,
  isSafeExternalUrl,
  sanitizeSpreadsheetCell,
  getTrustedOrigin,
} from '@/lib/security/redirect';
import {
  getVietnamDateString,
  vnWallClockToUtcMs,
  formatVnHHMM,
} from '@/lib/utils/vn-date';
import {
  runWithConcurrency,
  runSerializedByKey,
} from '@/lib/utils/concurrency-queue';
import { mergeEventMeta, type EventMeta } from '@/lib/constants/event-meta-store';
import {
  generatePersonalQRToken,
  verifyPersonalQRToken,
} from '@/lib/utils/personal-qr';
import {
  isApprovedVolunteer,
  parseJsonSetting,
} from '@/lib/utils/event-logic';
import { isTrustedPushEndpoint } from '@/lib/utils/web-push';
import { extractRawTokenFromCookies } from '@/lib/supabase/auth-helper';
import { ToastProvider, useToast } from '@/components/ToastProvider';

describe('High-load & security regressions', () => {
  describe('Supabase pagination & chunking', () => {
    it('fetchAllRows uses single-query fast path for <1000 rows', async () => {
      const sampleRows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));
      const rangeSpy = jest.fn(async (start: number, end: number) => ({
        data: sampleRows.slice(start, end + 1),
        error: null,
      }));
      const buildQuery = jest.fn(() => ({ range: rangeSpy }));

      const res = await fetchAllRows(buildQuery, 1000);
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(120);
      expect(buildQuery).toHaveBeenCalledTimes(1);
      expect(rangeSpy).toHaveBeenCalledWith(0, 999);
    });

    it('fetchAllRows paginates 2,500 rows across parallel waves cleanly', async () => {
      const all = Array.from({ length: 2500 }, (_, i) => ({ mssv: `N22DCCN${i}` }));
      const buildQuery = () => ({
        range: async (start: number, end: number) => ({
          data: all.slice(start, end + 1),
          error: null,
        }),
      });

      const res = await fetchAllRows(buildQuery, 1000);
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(2500);
      expect(res.data[0]).toEqual({ mssv: 'N22DCCN0' });
      expect(res.data[2499]).toEqual({ mssv: 'N22DCCN2499' });
    });

    it('fetchAllRows gracefully falls back when query builder omits .range()', async () => {
      const mockRows = [{ id: 'a' }, { id: 'b' }];
      const buildQuery = () => Promise.resolve({ data: mockRows, error: null });

      const res = await fetchAllRows(buildQuery, 1000);
      expect(res.error).toBeNull();
      expect(res.data).toEqual(mockRows);
    });

    it('chunkArray splits non-empty inputs cleanly and handles empty arrays', () => {
      expect(chunkArray([], 200)).toEqual([]);
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('Redirect, URL & spreadsheet formula neutralization', () => {
    it('sanitizeRedirectPath blocks open redirects and preserves valid internal paths', () => {
      expect(sanitizeRedirectPath('https://evil.com')).toBe('/');
      expect(sanitizeRedirectPath('//evil.com')).toBe('/');
      expect(sanitizeRedirectPath('/\\evil.com')).toBe('/');
      expect(sanitizeRedirectPath('javascript:alert(1)')).toBe('/');
      expect(sanitizeRedirectPath('/student?tab=qr', '/')).toBe('/student?tab=qr');
    });

    it('isSafeExternalUrl allows https links and rejects javascript:/data: schemes', () => {
      expect(isSafeExternalUrl('https://drive.google.com/file/d/123')).toBe(true);
      expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('sanitizeSpreadsheetCell neutralizes CSV/Excel formula injection payloads', () => {
      expect(sanitizeSpreadsheetCell('=CMD()')).toBe("'=CMD()");
      expect(sanitizeSpreadsheetCell('+1+1')).toBe("'+1+1");
      expect(sanitizeSpreadsheetCell('-2+3')).toBe("'-2+3");
      expect(sanitizeSpreadsheetCell('@SUM(A1)')).toBe("'@SUM(A1)");
      expect(sanitizeSpreadsheetCell('\t=1')).toBe("'\t=1");
      expect(sanitizeSpreadsheetCell('\r=1')).toBe("'\r=1");
      expect(sanitizeSpreadsheetCell('Nguyễn Văn A')).toBe('Nguyễn Văn A');
      expect(sanitizeSpreadsheetCell(42)).toBe(42);
    });
  });

  describe('Vietnam timezone (UTC+7) helpers', () => {
    it('getVietnamDateString shifts UTC+7 across midnight accurately', () => {
      const utcMs = Date.parse('2026-05-10T18:30:00.000Z'); // 01:30 on 2026-05-11 in VN
      expect(getVietnamDateString(0, utcMs)).toBe('2026-05-11');
    });

    it('vnWallClockToUtcMs & formatVnHHMM map VN wall clock consistently', () => {
      const utcMs = vnWallClockToUtcMs('2026-05-10', '07:30');
      expect(utcMs).toBe(Date.parse('2026-05-10T00:30:00.000Z'));
      expect(formatVnHHMM(utcMs as number)).toBe('07:30');
    });
  });

  describe('Concurrency limiter & per-key serializer', () => {
    it('runWithConcurrency caps simultaneous active tasks at limit', async () => {
      let active = 0;
      let maxActive = 0;

      const results = await Promise.all(
        Array.from({ length: 50 }, (_, idx) =>
          runWithConcurrency('test_pool', 5, async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((r) => setTimeout(r, 2));
            active--;
            return idx;
          })
        )
      );

      expect(maxActive).toBeLessThanOrEqual(5);
      expect(maxActive).toBeGreaterThanOrEqual(1);
      expect(results).toHaveLength(50);
      expect(results[0]).toBe(0);
      expect(results[49]).toBe(49);
    });

    it('runSerializedByKey prevents overlapping critical sections per key', async () => {
      let activeForEvent1 = 0;
      let overlapDetected = false;
      const orderEvent1: number[] = [];

      const event1Tasks = Array.from({ length: 10 }, (_, idx) =>
        runSerializedByKey('event-1', async () => {
          activeForEvent1++;
          if (activeForEvent1 > 1) overlapDetected = true;
          await new Promise((r) => setTimeout(r, 2));
          orderEvent1.push(idx);
          activeForEvent1--;
          return `e1-${idx}`;
        })
      );

      const event2Tasks = Array.from({ length: 5 }, (_, idx) =>
        runSerializedByKey('event-2', async () => {
          await new Promise((r) => setTimeout(r, 1));
          return `e2-${idx}`;
        })
      );

      const [res1, res2] = await Promise.all([Promise.all(event1Tasks), Promise.all(event2Tasks)]);
      expect(overlapDetected).toBe(false);
      expect(orderEvent1).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(res1).toHaveLength(10);
      expect(res2).toHaveLength(5);
    });
  });

  describe('Event meta store merge safety', () => {
    it('mergeEventMeta preserves optional metadata fields on partial DB/file merges', () => {
      const existingFileMeta: EventMeta = {
        cancellation_policy: 'disabled',
        is_support_event: true,
        organization_unit: 'LCĐ CNTT',
        description: 'Sự kiện quan trọng',
        sessions: [{ id: 's1', name: 'Ca 1' }],
        departments: [{ id: 'd1', name: 'Ban Truyền Thông', target_count: 10 }],
        max_participants: 150,
      };

      const partialDbMeta: EventMeta = {
        max_participants: 200,
      };

      const merged = mergeEventMeta(partialDbMeta, existingFileMeta);
      expect(merged.max_participants).toBe(200);
      expect(merged.cancellation_policy).toBe('disabled');
      expect(merged.is_support_event).toBe(true);
      expect(merged.organization_unit).toBe('LCĐ CNTT');
      expect(merged.description).toBe('Sự kiện quan trọng');
      expect(merged.sessions).toHaveLength(1);
      expect(merged.departments).toHaveLength(1);
    });

    it('mergeEventMeta respects empty DB arrays and does not resurrect deleted sessions/departments', () => {
      const staleFileMeta: EventMeta = {
        sessions: [{ id: 's-old', name: 'Old Session' }],
        departments: [{ id: 'd-old', name: 'Old Dept', target_count: 5 }],
      };
      const dbMetaAfterDelete: EventMeta = {
        sessions: [],
        departments: [],
      };

      const merged = mergeEventMeta(dbMetaAfterDelete, staleFileMeta);
      expect(merged.sessions).toEqual([]);
      expect(merged.departments).toEqual([]);
    });
  });

  describe('Second-pass critical security & functional regressions', () => {
    it('verifyPersonalQRToken accepts both lowercase and UPPERCASE signatures and rejects tampering', () => {
      const mssv = 'N22DCCN158';
      const { token } = generatePersonalQRToken(mssv);
      const validLower = verifyPersonalQRToken(token);
      expect(validLower.valid).toBe(true);
      expect(validLower.mssv).toBe(mssv);

      const validUpper = verifyPersonalQRToken(token.toUpperCase());
      expect(validUpper.valid).toBe(true);
      expect(validUpper.mssv).toBe(mssv);

      const tampered = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
      expect(verifyPersonalQRToken(tampered).valid).toBe(false);
    });

    it('isApprovedVolunteer strictly separates participants from accepted volunteers', () => {
      expect(isApprovedVolunteer('participant', { review_status: 'accepted' })).toBe(false);
      expect(isApprovedVolunteer(null, { review_status: 'accepted' })).toBe(false);
      expect(isApprovedVolunteer('volunteer', { review_status: 'pending' })).toBe(false);
      expect(isApprovedVolunteer('volunteer', { review_status: 'rejected' })).toBe(false);
      expect(isApprovedVolunteer('volunteer', null)).toBe(false);
      expect(isApprovedVolunteer('volunteer', { review_status: 'accepted' })).toBe(true);
      expect(isApprovedVolunteer('ctv', { review_status: 'accepted' })).toBe(true);
      expect(isApprovedVolunteer('dept_media', { review_status: 'accepted' })).toBe(true);
    });

    it('getTrustedOrigin rejects userinfo host poisoning and untrusted localhost in production', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.NEXT_PUBLIC_SITE_URL = 'https://ptithcm.com';
        delete process.env.NEXT_PUBLIC_APP_URL;

        const poisonedReq = new Request('https://ptithcm.com/auth/callback', {
          headers: {
            'x-forwarded-host': 'ptithcm.com:80@evil.com',
            'x-forwarded-proto': 'https',
          },
        });
        expect(getTrustedOrigin(poisonedReq)).toBe('https://ptithcm.com');

        const localhostReq = new Request('https://ptithcm.com/auth/callback', {
          headers: {
            'x-forwarded-host': 'localhost:3000',
            'x-forwarded-proto': 'http',
          },
        });
        expect(getTrustedOrigin(localhostReq)).toBe('https://ptithcm.com');

        const validReq = new Request('https://ptithcm.com/auth/callback', {
          headers: {
            'x-forwarded-host': 'ptithcm.com',
            'x-forwarded-proto': 'https',
          },
        });
        expect(getTrustedOrigin(validReq)).toBe('https://ptithcm.com');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
        if (prevSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
        else process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl;
        if (prevAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
      }
    });

    it('isTrustedPushEndpoint allows trusted Web Push hosts and blocks SSRF/userinfo URLs', () => {
      expect(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true);
      expect(isTrustedPushEndpoint('https://web.push.apple.com/QHx123')).toBe(true);
      expect(isTrustedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xyz')).toBe(true);
      expect(isTrustedPushEndpoint('http://127.0.0.1:8080/internal')).toBe(false);
      expect(isTrustedPushEndpoint('https://evil.example.com/push')).toBe(false);
      expect(isTrustedPushEndpoint('https://fcm.googleapis.com@evil.com/push')).toBe(false);
      expect(isTrustedPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/abc')).toBe(false);
    });

    it('parseJsonSetting cleanly unwraps native objects and double-encoded JSON strings', () => {
      expect(parseJsonSetting<{ enabled: boolean }>({ enabled: true })).toEqual({ enabled: true });
      expect(parseJsonSetting<{ enabled: boolean }>('{"enabled":true}')).toEqual({ enabled: true });
      expect(parseJsonSetting<{ enabled: boolean }>('"{\\"enabled\\":true}"')).toEqual({ enabled: true });
      expect(parseJsonSetting('not-json')).toBeNull();
    });

    it('extractRawTokenFromCookies ignores PKCE code-verifier and reassembles numeric chunks in order', () => {
      const payload = JSON.stringify({ access_token: 'eyJ-real-token-value-12345' });
      const b64 = 'base64-' + Buffer.from(payload, 'utf8').toString('base64');
      // Split into 12 chunks so .10 and .11 verify numeric vs lexicographic sort
      const chunkSize = Math.max(1, Math.ceil(b64.length / 12));
      const cookies: Array<{ name: string; value: string }> = [
        { name: 'sb-proj-auth-token-code-verifier', value: 'pkce-garbage-must-be-ignored' },
      ];
      for (let i = 0; i * chunkSize < b64.length; i++) {
        cookies.push({
          name: `sb-proj-auth-token.${i}`,
          value: b64.slice(i * chunkSize, (i + 1) * chunkSize),
        });
      }
      // Deliberately shuffle cookie order so lexicographic ordering would corrupt the payload
      const shuffled = [...cookies].reverse();
      expect(extractRawTokenFromCookies(shuffled)).toBe('eyJ-real-token-value-12345');
    });

    it('ToastProvider preserves stable context identity across toast emissions (no render loop)', () => {
      jest.useFakeTimers();
      try {
        const seenContexts: unknown[] = [];
        let latestToast: ReturnType<typeof useToast> | null = null;

        function Probe() {
          const toast = useToast();
          seenContexts.push(toast);
          latestToast = toast;
          return null;
        }

        render(React.createElement(ToastProvider, null, React.createElement(Probe)));
        expect(seenContexts.length).toBeGreaterThanOrEqual(1);
        const firstRef = seenContexts[0];

        act(() => {
          latestToast?.error('Simulated fetch error');
        });
        act(() => {
          jest.advanceTimersByTime(4000);
        });

        for (const ref of seenContexts) {
          expect(ref).toBe(firstRef);
        }
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
