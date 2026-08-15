interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup stale rate limit records every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < 60000);
    if (record.timestamps.length === 0) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);

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
  const record = rateLimitMap.get(identifier) || { timestamps: [] };

  // Remove timestamps outside current window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);
  const remaining = Math.max(0, maxRequests - validTimestamps.length);
  const oldestTimestamp = validTimestamps[0] || now;
  const resetInSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

  if (validTimestamps.length >= maxRequests) {
    rateLimitMap.set(identifier, { timestamps: validTimestamps });
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetInSeconds: Math.max(1, resetInSeconds),
    };
  }

  validTimestamps.push(now);
  rateLimitMap.set(identifier, { timestamps: validTimestamps });

  return {
    allowed: true,
    limit: maxRequests,
    remaining: remaining - 1,
    resetInSeconds: Math.max(1, resetInSeconds),
  };
}
