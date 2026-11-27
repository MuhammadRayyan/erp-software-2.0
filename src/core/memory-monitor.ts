import { readFileSync } from "node:fs";

const SAMPLE_INTERVAL_MS = 60_000;
const WARN_RATIO = 0.75;
const WARN_REPEAT_MS = 30 * 60_000;

type MemorySnapshot = {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  /** Container memory limit from the cgroup, when one is set. */
  limitMb: number | null;
  /** RSS as a share of the container limit (0–1), when a limit is set. */
  rssRatio: number | null;
};

const toMb = (bytes: number) => Math.round(bytes / (1024 * 1024));

let cachedLimit: number | null | undefined;

/** Reads the cgroup v2 (or v1) memory limit; null when unlimited or not in a container. */
export function getContainerMemoryLimitBytes(): number | null {
  if (cachedLimit !== undefined) return cachedLimit;
  cachedLimit = null;
  // Literal paths (not a loop variable): a dynamic fs path makes Turbopack's
  // output tracing copy the whole project into the standalone build.
  const readers = [
    () => readFileSync("/sys/fs/cgroup/memory.max", "utf8"),
    () => readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8"),
  ];
  for (const read of readers) {
    try {
      const raw = read().trim();
      const value = Number(raw);
      // cgroup v1 reports "unlimited" as a value near 2^63.
      if (raw !== "max" && Number.isFinite(value) && value > 0 && value < 2 ** 60) cachedLimit = value;
      break;
    } catch {
      // Try the next layout.
    }
  }
  return cachedLimit;
}

export function getMemorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  const limit = getContainerMemoryLimitBytes();
  return {
    rssMb: toMb(usage.rss),
    heapUsedMb: toMb(usage.heapUsed),
    heapTotalMb: toMb(usage.heapTotal),
    externalMb: toMb(usage.external),
    arrayBuffersMb: toMb(usage.arrayBuffers),
    limitMb: limit === null ? null : toMb(limit),
    rssRatio: limit === null ? null : Math.round((usage.rss / limit) * 100) / 100,
  };
}

const globalForMonitor = globalThis as unknown as { __erpMemoryMonitor?: ReturnType<typeof setInterval> };

/**
 * Samples process memory every minute and calls `warn` when RSS passes 75% of
 * the container limit, at most every 30 minutes, so growth is visible well
 * before the kernel kills the process. Does nothing outside a memory-limited
 * container.
 */
export function startMemoryMonitor(warn: (message: string, metadata: Record<string, unknown>) => void) {
  if (globalForMonitor.__erpMemoryMonitor || getContainerMemoryLimitBytes() === null) return;
  let lastWarnedAt = 0;
  const timer = setInterval(() => {
    const snapshot = getMemorySnapshot();
    if (snapshot.rssRatio === null || snapshot.rssRatio < WARN_RATIO) return;
    if (Date.now() - lastWarnedAt < WARN_REPEAT_MS) return;
    lastWarnedAt = Date.now();
    warn(`Memory high: RSS ${snapshot.rssMb} MB of ${snapshot.limitMb} MB container limit`, snapshot);
  }, SAMPLE_INTERVAL_MS);
  timer.unref?.();
  globalForMonitor.__erpMemoryMonitor = timer;
}
