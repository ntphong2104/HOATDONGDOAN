/**
 * Lightweight in-memory concurrency limiter & per-key serializer for Node.js VPS.
 *
 * 1. `runWithConcurrency`: Caps simultaneous DB-heavy requests (e.g. 2,000 students
 *    clicking check-in/register at the same second) so Supabase Free tier is fed
 *    smoothly (~30-40 concurrent ops) instead of getting hit with 2,000 simultaneous
 *    connections and throwing 503/timeouts.
 *
 * 2. `runSerializedByKey`: Serializes read-modify-write operations on the same
 *    `system_settings` JSON key (e.g. `reg_extras_<eventId>`, `session_checkins_<eventId>`)
 *    within this Node process to prevent lost-update race conditions.
 */

interface SemaphoreState {
  active: number;
  queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer?: ReturnType<typeof setTimeout>;
  }>;
}

const gQueue = globalThis as unknown as {
  __hddSemaphores?: Map<string, SemaphoreState>;
  __hddKeyLocks?: Map<string, Promise<unknown>>;
};

const semaphores = (gQueue.__hddSemaphores ||= new Map<string, SemaphoreState>());
const keyLocks = (gQueue.__hddKeyLocks ||= new Map<string, Promise<unknown>>());

function getSemaphore(name: string): SemaphoreState {
  let state = semaphores.get(name);
  if (!state) {
    state = { active: 0, queue: [] };
    semaphores.set(name, state);
  }
  return state;
}

export class QueueTimeoutError extends Error {
  constructor(message = 'Hệ thống đang quá tải tạm thời, vui lòng thử lại sau vài giây.') {
    super(message);
    this.name = 'QueueTimeoutError';
  }
}

/**
 * Runs `fn` while ensuring at most `maxConcurrent` executions for `queueName`
 * are active simultaneously. Excess callers wait cleanly in FIFO order.
 */
export async function runWithConcurrency<T>(
  queueName: string,
  maxConcurrent: number,
  fn: () => Promise<T>,
  waitTimeoutMs: number = 15_000
): Promise<T> {
  const limit = Math.max(1, maxConcurrent);
  const state = getSemaphore(queueName);

  if (state.active >= limit) {
    await new Promise<void>((resolve, reject) => {
      const waiter: SemaphoreState['queue'][number] = { resolve, reject };
      if (waitTimeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const idx = state.queue.indexOf(waiter);
          if (idx >= 0) state.queue.splice(idx, 1);
          reject(new QueueTimeoutError());
        }, waitTimeoutMs);
        if (typeof waiter.timer === 'object' && waiter.timer && 'unref' in waiter.timer) {
          waiter.timer.unref();
        }
      }
      state.queue.push(waiter);
    });
    // Slot was transferred directly by the completing task (state.active already accounts for us)
  } else {
    state.active++;
  }

  try {
    return await fn();
  } finally {
    const next = state.queue.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      // Transfer active slot directly to the next queued caller to prevent barging above limit
      next.resolve();
    } else {
      state.active = Math.max(0, state.active - 1);
    }
  }
}

/**
 * Serializes async operations sharing the same `key` (FIFO chain) so concurrent
 * read-modify-write updates to a JSON blob never clobber each other.
 */
export async function runSerializedByKey<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = keyLocks.get(key) || Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  const tail = prev.then(() => current, () => current);
  keyLocks.set(key, tail);

  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
    if (keyLocks.get(key) === tail) {
      keyLocks.delete(key);
    }
  }
}
