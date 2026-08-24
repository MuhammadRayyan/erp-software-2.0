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
