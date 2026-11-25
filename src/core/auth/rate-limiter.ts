// IMPORTANT: This module uses in-memory state and setInterval.
// It MUST only be imported by API routes (Node runtime), NEVER by middleware (Edge runtime).

const WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const MAX_ATTEMPTS = 5;

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let attempt = attempts.get(ip);

  if (!attempt || now > attempt.resetAt) {
    attempt = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, attempt);
  }

  if (attempt.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: attempt.resetAt };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - attempt.count, resetAt: attempt.resetAt };
}

export function recordFailedAttempt(ip: string) {
  const now = Date.now();
  let attempt = attempts.get(ip);

  if (!attempt || now > attempt.resetAt) {
    attempt = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, attempt);
  }

  attempt.count += 1;
}

export function clearAttempts(ip: string) {
  attempts.delete(ip);
}

// Periodic cleanup of expired entries (every 5 minutes)
// Safe here because this module only loads in the Node runtime (API routes).
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, attempt] of attempts) {
    if (now > attempt.resetAt) attempts.delete(ip);
  }
}, 5 * 60 * 1000);
// Never keep the process alive just for this timer (CLI scripts import auth too).
cleanupTimer.unref?.();

/**
 * Independent fixed-window counter for actions that are not failed logins
 * (e.g. public password-reset requests). Each limiter keeps its own map.
 */
export function createFixedWindowLimiter(options: { windowMs: number; max: number }) {
  const hits = new Map<string, Attempt>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, Math.min(options.windowMs, 5 * 60 * 1000));
  sweep.unref?.();

  return {
    /** Counts one hit for `key`; returns false once the window's limit is exceeded. */
    take(key: string) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + options.windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= options.max;
    },
  };
}
