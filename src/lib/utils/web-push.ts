import crypto from 'crypto';
import type { LcdCode } from '@/lib/utils/lcd';
import { runSerializedByKey } from '@/lib/utils/concurrency-queue';

/**
 * Zero-dependency Web Push implementation using Node.js built-in `crypto` + native `fetch`.
 * Implements:
 * - RFC 8292: Voluntary Application Server Identification (VAPID) with ES256 JWT
 * - RFC 8291 + RFC 8188: Message Encryption for Web Push (`aes128gcm`)
 *
 * Compatible with Apple Web Push (iOS 16.4+ Home Screen PWA & macOS Safari),
 * Google FCM (Android & Desktop Chrome), Mozilla Push (Firefox), and Microsoft WNS (Edge).
 */

export interface VapidKeyConfig {
  publicKey: string; // 65-byte uncompressed P-256 point encoded as base64url (87 chars)
  privateJwk: crypto.JsonWebKey;
  subject: string; // e.g. 'mailto:nnguyenthanhphong2104@gmail.com'
}

export interface StoredPushSubscription {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_email?: string;
  mssv?: string | null;
  lcd_code?: string | null;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

const DEFAULT_VAPID_SUBJECT = 'mailto:nnguyenthanhphong2104@gmail.com';
const VAPID_CACHE_TTL_MS = 10 * 60_000; // 10 minutes

const gPush = globalThis as unknown as {
  __hddVapidCache?: { config: VapidKeyConfig; expiresAt: number };
};

export function base64UrlEncode(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlDecode(str: string): Buffer {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

/**
 * Generates a fresh P-256 VAPID keypair suitable for Web Push.
 */
export function generateVapidKeyPair(subject = DEFAULT_VAPID_SUBJECT): VapidKeyConfig {
  const { privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const privateJwk = privateKey.export({ format: 'jwk' }) as crypto.JsonWebKey;
  const x = base64UrlDecode(String(privateJwk.x || ''));
  const y = base64UrlDecode(String(privateJwk.y || ''));
  if (x.length !== 32 || y.length !== 32) {
    throw new Error('Failed to generate valid 32-byte P-256 coordinates');
  }
  const uncompressedPub = Buffer.concat([Buffer.from([0x04]), x, y]);
  return {
    publicKey: base64UrlEncode(uncompressedPub),
    privateJwk,
    subject,
  };
}

/**
 * Loads the singleton VAPID keypair (env vars -> RAM cache -> Supabase `push_vapid_keys`,
 * auto-generating and persisting once if missing).
 * Requires service_role Admin Client when reading/creating `push_vapid_keys`.
 */
export async function getOrCreateVapidKeys(supabase: any): Promise<VapidKeyConfig | null> {
  // 1. Optional environment variable override
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_JWK) {
    try {
      const privateJwk = JSON.parse(process.env.VAPID_PRIVATE_JWK);
      return {
        publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
        privateJwk,
        subject: process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT,
      };
    } catch {}
  }

  // 2. In-memory cache
  const now = Date.now();
  if (gPush.__hddVapidCache && gPush.__hddVapidCache.expiresAt > now) {
    return gPush.__hddVapidCache.config;
  }

  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('push_vapid_keys')
      .select('public_key, private_jwk, subject')
      .eq('id', 'default')
      .maybeSingle();

    if (!error && data?.public_key && data?.private_jwk) {
      const config: VapidKeyConfig = {
        publicKey: String(data.public_key),
        privateJwk:
          typeof data.private_jwk === 'string'
            ? JSON.parse(data.private_jwk)
            : data.private_jwk,
        subject: String(data.subject || DEFAULT_VAPID_SUBJECT),
      };
      gPush.__hddVapidCache = { config, expiresAt: now + VAPID_CACHE_TTL_MS };
      return config;
    }

    // If table exists and simply has no row yet, auto-generate and insert safely
    if (!error && !data) {
      const generated = generateVapidKeyPair();
      const { error: insErr } = await supabase
        .from('push_vapid_keys')
        .upsert(
          {
            id: 'default',
            public_key: generated.publicKey,
            private_jwk: generated.privateJwk,
            subject: generated.subject,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );

      if (!insErr) {
        // Re-read in case another PM2 worker inserted at the exact same millisecond
        const { data: persisted } = await supabase
          .from('push_vapid_keys')
          .select('public_key, private_jwk, subject')
          .eq('id', 'default')
          .maybeSingle();

        const finalCfg: VapidKeyConfig = persisted?.public_key
          ? {
              publicKey: String(persisted.public_key),
              privateJwk:
                typeof persisted.private_jwk === 'string'
                  ? JSON.parse(persisted.private_jwk)
                  : persisted.private_jwk,
              subject: String(persisted.subject || DEFAULT_VAPID_SUBJECT),
            }
          : generated;

        gPush.__hddVapidCache = { config: finalCfg, expiresAt: now + VAPID_CACHE_TTL_MS };
        return finalCfg;
      }
    }
  } catch (err) {
    console.warn('[web-push] Unable to load VAPID keys:', err);
  }

  return null;
}

/**
 * Returns ONLY the VAPID public key (safe to expose to authenticated browsers).
 */
export async function getPublicVapidKey(supabase: any): Promise<string | null> {
  const full = await getOrCreateVapidKeys(supabase);
  if (full?.publicKey) return full.publicKey;

  // Fallback for local dev without SUPABASE_SERVICE_ROLE_KEY: call public-key-only RPC
  if (supabase && typeof supabase.rpc === 'function') {
    try {
      const { data, error } = await supabase.rpc('get_web_push_public_key');
      if (!error && typeof data === 'string' && data.length >= 60) {
        return data;
      }
    } catch {}
  }

  return null;
}

/**
 * Builds RFC 8292 `Authorization: vapid t=<jwt>, k=<publicKey>` header for a push endpoint.
 */
export function buildVapidAuthHeader(
  endpoint: string,
  vapid: VapidKeyConfig,
  nowSec: number = Math.floor(Date.now() / 1000)
): string {
  const origin = new URL(endpoint).origin;
  const headerB64 = base64UrlEncode(
    Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8')
  );
  const claimsB64 = base64UrlEncode(
    Buffer.from(
      JSON.stringify({
        aud: origin,
        exp: nowSec + 12 * 3600, // 12 hours (< 24h max per RFC 8292)
        sub: vapid.subject || DEFAULT_VAPID_SUBJECT,
      }),
      'utf8'
    )
  );
  const signingInput = `${headerB64}.${claimsB64}`;

  const privateKeyObj = crypto.createPrivateKey({
    key: vapid.privateJwk as crypto.JsonWebKey,
    format: 'jwk',
  });
  const sig = crypto.sign('sha256', Buffer.from(signingInput, 'ascii'), {
    key: privateKeyObj,
    dsaEncoding: 'ieee-p1363',
  });

  const jwt = `${signingInput}.${base64UrlEncode(sig)}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/**
 * Encrypts a UTF-8 push payload per RFC 8291 + RFC 8188 (`aes128gcm`).
 */
export function encryptWebPushPayload(
  plaintext: Buffer,
  p256dhBase64Url: string,
  authBase64Url: string
): Buffer {
  const uaPublic = base64UrlDecode(p256dhBase64Url);
  const authSecret = base64UrlDecode(authBase64Url);

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('Invalid client p256dh public key');
  }
  if (authSecret.length !== 16) {
    throw new Error('Invalid client auth secret');
  }

  // Ephemeral application server ECDH keypair
  const asEcdh = crypto.createECDH('prime256v1');
  asEcdh.generateKeys();
  const asPublic = asEcdh.getPublicKey(); // 65 bytes uncompressed
  const ecdhSecret = asEcdh.computeSecret(uaPublic);

  // RFC 8291 §3.3: IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info\0" || ua_pub || as_pub, L=32)
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));

  // RFC 8291 §3.4 & RFC 8188: random 16-byte salt -> derive CEK (16B) & Nonce (12B)
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16)
  );
  const nonce = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12)
  );

  // Final record delimiter 0x02 (RFC 8188 §2)
  const padded = Buffer.concat([plaintext, Buffer.from([0x02])]);

  // Ensure record fits single 4096-byte record
  const rs = 4096;
  if (padded.length + 16 > rs) {
    throw new Error('Web Push payload exceeds 4096-byte single record limit');
  }

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  // RFC 8188 header: salt(16) || rs(4, BE) || idlen(1) || keyid(65) || ciphertext
  const rsBuf = Buffer.alloc(4);
  rsBuf.writeUInt32BE(rs, 0);

  return Buffer.concat([salt, rsBuf, Buffer.from([asPublic.length]), asPublic, encrypted]);
}

/**
 * Sends a single encrypted Web Push message to one device subscription.
 */
export async function sendSingleWebPush(
  subscription: StoredPushSubscription,
  payload: WebPushPayload,
  vapid: VapidKeyConfig,
  ttlSeconds = 86400
): Promise<{ ok: boolean; status: number; expired: boolean; error?: string }> {
  try {
    const bodyJson = JSON.stringify({
      title: payload.title.slice(0, 120),
      body: payload.body.slice(0, 320),
      url: payload.url || '/',
      tag: payload.tag || 'ptit-doan-notification',
      icon: payload.icon || '/icon-192.png?v=doan3',
      badge: payload.badge || '/favicon-32x32.png?v=doan',
    });

    const encryptedBody = encryptWebPushPayload(
      Buffer.from(bodyJson, 'utf8'),
      subscription.p256dh,
      subscription.auth
    );
    const authorization = buildVapidAuthHeader(subscription.endpoint, vapid);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    if (typeof timer === 'object' && timer && 'unref' in timer) {
      timer.unref();
    }

    try {
      const res = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(ttlSeconds),
          Urgency: 'normal',
        },
        body: new Uint8Array(encryptedBody),
        signal: controller.signal,
      });

      const expired = res.status === 404 || res.status === 410;
      const ok = res.status >= 200 && res.status < 300;
      if (!ok) {
        const errText = await res.text().catch(() => '');
        return { ok: false, status: res.status, expired, error: errText.slice(0, 200) };
      }
      return { ok: true, status: res.status, expired: false };
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      expired: false,
      error: err?.message || 'Push fetch failed',
    };
  }
}

/**
 * Dispatches a push payload to a list of subscriptions in batches of 40,
 * automatically deactivating expired (404 / 410 Gone) endpoints.
 */
export async function dispatchPushToSubscriptions(
  supabase: any,
  subscriptions: StoredPushSubscription[],
  payload: WebPushPayload
): Promise<{ total: number; delivered: number; failed: number; expiredCleaned: number }> {
  if (!subscriptions || subscriptions.length === 0) {
    return { total: 0, delivered: 0, failed: 0, expiredCleaned: 0 };
  }

  const vapid = await getOrCreateVapidKeys(supabase);
  if (!vapid) {
    return { total: subscriptions.length, delivered: 0, failed: subscriptions.length, expiredCleaned: 0 };
  }

  const BATCH_SIZE = 40;
  let delivered = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];
  const deliveredEndpoints: string[] = [];

  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (sub) => {
        const r = await sendSingleWebPush(sub, payload, vapid);
        return { sub, r };
      })
    );

    for (const { sub, r } of results) {
      if (r.ok) {
        delivered++;
        deliveredEndpoints.push(sub.endpoint);
      } else {
        failed++;
        if (r.expired) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    }
  }

  if (supabase && expiredEndpoints.length > 0) {
    try {
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('endpoint', expiredEndpoints);
    } catch {}
  }

  if (supabase && deliveredEndpoints.length > 0) {
    try {
      await supabase
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .in('endpoint', deliveredEndpoints.slice(0, 200));
    } catch {}
  }

  return {
    total: subscriptions.length,
    delivered,
    failed,
    expiredCleaned: expiredEndpoints.length,
  };
}

export interface StoredInboxNotification {
  id: string;
  title: string;
  body: string;
  url: string | null;
  target_type: string;
  target_value: string | null;
  created_at: string;
}

const INBOX_HISTORY_KEY = 'push_inbox_history';
const MAX_INBOX_HISTORY = 100;

/**
 * Records a notification into `system_settings` (`push_inbox_history`) so the
 * in-app bell inbox works reliably even if the optional `push_logs` table is absent.
 */
export async function recordInboxNotification(
  supabase: any,
  entry: {
    id?: string;
    title: string;
    body: string;
    url?: string | null;
    target_type: string;
    target_value?: string | null;
  }
): Promise<void> {
  if (!supabase || !entry?.title) return;
  try {
    await runSerializedByKey(INBOX_HISTORY_KEY, async () => {
      let existing: StoredInboxNotification[] = [];
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', INBOX_HISTORY_KEY)
          .maybeSingle();
        if (data?.value) {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          if (Array.isArray(parsed)) existing = parsed;
        }
      } catch {}

      const newItem: StoredInboxNotification = {
        id: entry.id || crypto.randomUUID(),
        title: String(entry.title).slice(0, 140),
        body: String(entry.body || '').slice(0, 400),
        url: entry.url ? String(entry.url) : null,
        target_type: String(entry.target_type || 'all'),
        target_value: entry.target_value ? String(entry.target_value) : null,
        created_at: new Date().toISOString(),
      };

      const next = [newItem, ...existing.filter((x) => x && x.id !== newItem.id)].slice(
        0,
        MAX_INBOX_HISTORY
      );

      await supabase.from('system_settings').upsert(
        {
          key: INBOX_HISTORY_KEY,
          value: JSON.stringify(next),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

      // Invalidate shared in-app notification feed cache immediately
      const gNotif = globalThis as unknown as { __hddNotifFeedCache?: { expiresAt: number } };
      if (gNotif.__hddNotifFeedCache) {
        gNotif.__hddNotifFeedCache.expiresAt = 0;
      }
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Fire-and-forget helper: send push to specific user emails.
 */
export async function notifyUsersByEmail(
  supabase: any,
  emails: string[],
  payload: WebPushPayload
): Promise<{ total: number; delivered: number; failed: number }> {
  try {
    const clean = Array.from(
      new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))
    );
    if (!supabase || clean.length === 0) return { total: 0, delivered: 0, failed: 0 };

    recordInboxNotification(supabase, {
      title: payload.title,
      body: payload.body,
      url: payload.url || null,
      target_type: 'emails',
      target_value: clean.join(','),
    }).catch(() => {});

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_email')
      .eq('is_active', true)
      .in('user_email', clean);

    if (error || !data || data.length === 0) return { total: 0, delivered: 0, failed: 0 };
    return await dispatchPushToSubscriptions(supabase, data, payload);
  } catch {
    return { total: 0, delivered: 0, failed: 0 };
  }
}

/**
 * Fire-and-forget helper: send push to specific MSSVs.
 */
export async function notifyUsersByMssv(
  supabase: any,
  mssvs: string[],
  payload: WebPushPayload,
  options?: { skipInboxLog?: boolean }
): Promise<{ total: number; delivered: number; failed: number }> {
  try {
    const clean = Array.from(
      new Set((mssvs || []).map((m) => String(m || '').trim().toUpperCase()).filter(Boolean))
    );
    if (!supabase || clean.length === 0) return { total: 0, delivered: 0, failed: 0 };

    if (!options?.skipInboxLog) {
      recordInboxNotification(supabase, {
        title: payload.title,
        body: payload.body,
        url: payload.url || null,
        target_type: 'mssv',
        target_value: clean.slice(0, 80).join(','),
      }).catch(() => {});
    }

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, mssv')
      .eq('is_active', true)
      .in('mssv', clean);

    if (error || !data || data.length === 0) return { total: 0, delivered: 0, failed: 0 };
    return await dispatchPushToSubscriptions(supabase, data, payload);
  } catch {
    return { total: 0, delivered: 0, failed: 0 };
  }
}

/**
 * Fire-and-forget helper: send push to students matching allowed LCĐs (or all active subscribers if empty).
 */
export async function notifyStudentsByScope(
  supabase: any,
  allowedLcds: LcdCode[] | string[] | null | undefined,
  payload: WebPushPayload
): Promise<{ total: number; delivered: number; failed: number }> {
  try {
    if (!supabase) return { total: 0, delivered: 0, failed: 0 };

    const isScoped = Array.isArray(allowedLcds) && allowedLcds.length > 0;
    recordInboxNotification(supabase, {
      title: payload.title,
      body: payload.body,
      url: payload.url || null,
      target_type: isScoped ? 'lcd' : 'all',
      target_value: isScoped ? allowedLcds.join(',') : null,
    }).catch(() => {});

    let query = supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, lcd_code, mssv')
      .eq('is_active', true)
      .not('mssv', 'is', null);

    if (isScoped) {
      query = query.in('lcd_code', allowedLcds);
    }

    const { data, error } = await query.limit(5000);
    if (error || !data || data.length === 0) return { total: 0, delivered: 0, failed: 0 };
    return await dispatchPushToSubscriptions(supabase, data, payload);
  } catch {
    return { total: 0, delivered: 0, failed: 0 };
  }
}
