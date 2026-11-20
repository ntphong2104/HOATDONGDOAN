import crypto from 'crypto';
import {
  generateVapidKeyPair,
  buildVapidAuthHeader,
  encryptWebPushPayload,
  base64UrlEncode,
  base64UrlDecode,
} from '@/lib/utils/web-push';

describe('web-push (RFC 8291 aes128gcm & RFC 8292 VAPID ES256)', () => {
  test('generates a valid 65-byte uncompressed P-256 VAPID public key', () => {
    const vapid = generateVapidKeyPair('mailto:test@ptithcm.com');
    const pubBytes = base64UrlDecode(vapid.publicKey);
    expect(pubBytes.length).toBe(65);
    expect(pubBytes[0]).toBe(0x04);
    expect(vapid.privateJwk.kty).toBe('EC');
    expect(vapid.privateJwk.crv).toBe('P-256');
  });

  test('signs a verifiable RFC 8292 ES256 VAPID Authorization header', () => {
    const vapid = generateVapidKeyPair('mailto:test@ptithcm.com');
    const endpoint = 'https://web.push.apple.com/QHxSampleEndpoint123';
    const nowSec = 1795155000;
    const authHeader = buildVapidAuthHeader(endpoint, vapid, nowSec);

    expect(authHeader.startsWith('vapid t=')).toBe(true);
    const match = authHeader.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(match).not.toBeNull();
    const jwt = match![1];
    const k = match![2];
    expect(k).toBe(vapid.publicKey);

    const [hB64, cB64, sB64] = jwt.split('.');
    const header = JSON.parse(base64UrlDecode(hB64).toString('utf8'));
    const claims = JSON.parse(base64UrlDecode(cB64).toString('utf8'));
    expect(header).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(claims.aud).toBe('https://web.push.apple.com');
    expect(claims.sub).toBe('mailto:test@ptithcm.com');
    expect(claims.exp).toBe(nowSec + 12 * 3600);

    // Verify ES256 signature using public key derived from JWK
    const pubKeyObj = crypto.createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: vapid.privateJwk.x, y: vapid.privateJwk.y },
      format: 'jwk',
    });
    const sigBuf = base64UrlDecode(sB64);
    expect(sigBuf.length).toBe(64); // IEEE P1363 raw r||s
    const valid = crypto.verify(
      'sha256',
      Buffer.from(`${hB64}.${cB64}`, 'ascii'),
      { key: pubKeyObj, dsaEncoding: 'ieee-p1363' },
      sigBuf
    );
    expect(valid).toBe(true);
  });

  test('encrypts payload with RFC 8291 aes128gcm so receiver browser can decrypt identically', () => {
    // Simulated browser (iPhone Safari / Android Chrome) subscription keys
    const uaEcdh = crypto.createECDH('prime256v1');
    uaEcdh.generateKeys();
    const uaPublic = uaEcdh.getPublicKey(); // 65 bytes
    const authSecret = crypto.randomBytes(16);

    const original = JSON.stringify({
      title: '🔔 Hoạt Động Đoàn PTIT HCM',
      body: 'Bán hoa 20/11 đang mở điểm danh Ca 2!',
      url: '/events',
    });

    const encrypted = encryptWebPushPayload(
      Buffer.from(original, 'utf8'),
      base64UrlEncode(uaPublic),
      base64UrlEncode(authSecret)
    );

    // Parse RFC 8188 header: salt(16) || rs(4) || idlen(1) || asPublic(65) || ciphertext || tag(16)
    const salt = encrypted.subarray(0, 16);
    const rs = encrypted.readUInt32BE(16);
    const idLen = encrypted[20];
    expect(rs).toBe(4096);
    expect(idLen).toBe(65);

    const asPublic = encrypted.subarray(21, 21 + idLen);
    const bodyAndTag = encrypted.subarray(21 + idLen);
    const ciphertext = bodyAndTag.subarray(0, bodyAndTag.length - 16);
    const authTag = bodyAndTag.subarray(bodyAndTag.length - 16);

    // Browser decrypts using its private ECDH key + authSecret
    const sharedSecret = uaEcdh.computeSecret(asPublic);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
    const cek = Buffer.from(
      crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16)
    );
    const nonce = Buffer.from(
      crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12)
    );

    const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(authTag);
    const decryptedPadded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Strip final record delimiter 0x02
    expect(decryptedPadded[decryptedPadded.length - 1]).toBe(0x02);
    const decryptedText = decryptedPadded.subarray(0, decryptedPadded.length - 1).toString('utf8');
    expect(decryptedText).toBe(original);
  });
});
