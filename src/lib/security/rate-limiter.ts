interface RateLimitRecord {
  timestamps: number[];
  windowMs: number;
}

const MAX_RATE_LIMIT_KEYS = 10000;

const gRateLimit = globalThis as unknown as {
  __hddRateLimitMap?: Map<string, RateLimitRecord>;
  __hddRateLimitCleanupStarted?: boolean;
};

const rateLimitMap = gRateLimit.__hddRateLimitMap || (gRateLimit.__hddRateLimitMap = new Map<string, RateLimitRecord>());

// Cleanup stale rate limit records every 60 seconds (singleton across bundles, unref so it never blocks Node/Jest exit)
if (!gRateLimit.__hddRateLimitCleanupStarted) {
  gRateLimit.__hddRateLimitCleanupStarted = true;
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      const retainMs = Math.max(record.windowMs || 60000, 60000);
      record.timestamps = record.timestamps.filter((ts) => now - ts < retainMs);
      if (record.timestamps.length === 0) {
        rateLimitMap.delete(key);
      }
    }
  }, 60000);

  if (typeof cleanupTimer === 'object' && cleanupTimer !== null && 'unref' in cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Sliding Window Rate Limiter
 * @param identifier IP or User ID
 * @param maxRequests Maximum allowed requests in window
 * @param windowMs Window duration in milliseconds (default: 10s)
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 10,
  windowMs = 10000
): RateLimitResult {
  const now = Date.now();
  const record = rateLimitMap.get(identifier) || { timestamps: [], windowMs };

  // Remove timestamps outside current window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);
  const remaining = Math.max(0, maxRequests - validTimestamps.length);
  const oldestTimestamp = validTimestamps[0] || now;
  const resetInSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

  if (validTimestamps.length >= maxRequests) {
    rateLimitMap.set(identifier, { timestamps: validTimestamps, windowMs });
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetInSeconds: Math.max(1, resetInSeconds),
    };
  }

  validTimestamps.push(now);
  if (!rateLimitMap.has(identifier) && rateLimitMap.size >= MAX_RATE_LIMIT_KEYS) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey !== undefined) rateLimitMap.delete(oldestKey);
  }
  rateLimitMap.set(identifier, { timestamps: validTimestamps, windowMs });

  return {
    allowed: true,
    limit: maxRequests,
    remaining: remaining - 1,
    resetInSeconds: Math.max(1, resetInSeconds),
  };
}
