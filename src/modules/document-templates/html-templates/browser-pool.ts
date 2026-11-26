import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";

const DEFAULT_IDLE_CLOSE_MS = 60_000;
const DEFAULT_MAX_CONCURRENT_RENDERS = 4;
const DEFAULT_MAX_RENDERS_BEFORE_RECYCLE = 100;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

type BrowserPoolState = {
  browser: Browser | null;
  launching: Promise<Browser> | null;
  activeRenders: number;
  totalRenders: number;
  launchCount: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  waitQueue: Array<() => void>;
  shutdownHookRegistered: boolean;
};

const globalForPool = globalThis as unknown as {
  __uaeHtmlPdfBrowserPool?: BrowserPoolState;
};

function getPoolState(): BrowserPoolState {
  if (!globalForPool.__uaeHtmlPdfBrowserPool) {
    globalForPool.__uaeHtmlPdfBrowserPool = {
      browser: null,
      launching: null,
      activeRenders: 0,
      totalRenders: 0,
      launchCount: 0,
      idleTimer: null,
      waitQueue: [],
      shutdownHookRegistered: false,
    };
  }
  return globalForPool.__uaeHtmlPdfBrowserPool;
}

function clearIdleTimer(state: BrowserPoolState) {
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

function scheduleIdleClose(state: BrowserPoolState) {
  clearIdleTimer(state);
  if (state.activeRenders > 0 || !state.browser) return;
  const idleMs = parsePositiveIntEnv("HTML_PDF_BROWSER_IDLE_MS", DEFAULT_IDLE_CLOSE_MS);
  state.idleTimer = setTimeout(() => {
    const current = getPoolState();
    if (current.activeRenders === 0 && current.browser) {
      void closeHtmlPdfBrowser();
    }
  }, idleMs);
  // Allow Node processes / test runners to exit cleanly rather than hanging on the idle timer.
  state.idleTimer.unref?.();
}

function registerShutdownHooks(state: BrowserPoolState) {
  if (state.shutdownHookRegistered) return;
  state.shutdownHookRegistered = true;
  const shutdown = () => {
    void closeHtmlPdfBrowser();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

// puppeteer-core never downloads a browser: production sets
// PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium; elsewhere use a system install.
const SYSTEM_BROWSER_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function resolveBrowserExecutablePath(): string {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (configured) return configured;
  const found = SYSTEM_BROWSER_PATHS.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error(
    "No Chromium found for HTML PDF rendering. Install chromium or set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium binary.",
  );
}

async function launchBrowser(): Promise<Browser> {
  const state = getPoolState();
  if (state.browser?.connected) {
    return state.browser;
  }
  if (state.launching) {
    return state.launching;
  }

  registerShutdownHooks(state);

  state.launching = (async () => {
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: resolveBrowserExecutablePath(),
      args: [
        // Chromium's sandbox cannot start in the production container: the host
        // (Ubuntu 24.04) blocks unprivileged user namespaces via AppArmor and the
        // setuid fallback is blocked by no-new-privileges (verified 26 Nov 2026).
        // Enabling it would need a weaker seccomp/AppArmor profile for the whole
        // container. Compensating controls instead: JavaScript is disabled for
        // template pages, every network request is intercepted and blocked,
        // DNS prefetch/background networking are off, and the container runs
        // read-only, non-root, with all capabilities dropped.
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        // Templates are user-authored HTML. Requests are already intercepted,
        // but resource hints can still trigger DNS lookups outside interception.
        "--dns-prefetch-disable",
        "--disable-features=NetworkPrediction,NetworkService.Prefetch",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-sync",
        "--no-first-run",
        "--no-zygote",
      ],
    });

    state.browser = browser;
    state.launchCount += 1;
    state.totalRenders = 0;

    browser.once("disconnected", () => {
      const current = getPoolState();
      if (current.browser === browser) {
        current.browser = null;
        clearIdleTimer(current);
      }
    });

    return browser;
  })();

  try {
    return await state.launching;
  } finally {
    state.launching = null;
  }
}

async function acquireRenderSlot(): Promise<void> {
  const state = getPoolState();
  const maxConcurrent = parsePositiveIntEnv("HTML_PDF_CONCURRENCY", DEFAULT_MAX_CONCURRENT_RENDERS);
  if (state.activeRenders < maxConcurrent) {
    state.activeRenders += 1;
    clearIdleTimer(state);
    return;
  }
  await new Promise<void>((resolve) => {
    state.waitQueue.push(resolve);
  });
  state.activeRenders += 1;
  clearIdleTimer(state);
}

function releaseRenderSlot(): void {
  const state = getPoolState();
  state.activeRenders = Math.max(0, state.activeRenders - 1);
  const next = state.waitQueue.shift();
  if (next) {
    next();
    return;
  }

  const maxRenders = parsePositiveIntEnv(
    "HTML_PDF_MAX_RENDERS_PER_BROWSER",
    DEFAULT_MAX_RENDERS_BEFORE_RECYCLE,
  );
  if (state.activeRenders === 0 && state.browser && state.totalRenders >= maxRenders) {
    void closeHtmlPdfBrowser();
    return;
  }

  scheduleIdleClose(state);
}

/**
 * Execute work inside a fresh, isolated incognito browser context on the shared
 * Chromium singleton, retrying once if the cached Chromium instance crashed
 * between renders.
 */
export async function withHtmlPdfPage<T>(
  fn: (page: Awaited<ReturnType<Browser["newPage"]>>) => Promise<T>,
): Promise<T> {
  await acquireRenderSlot();
  const state = getPoolState();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const browser = await launchBrowser();
      let context: Awaited<ReturnType<Browser["createBrowserContext"]>> | null = null;
      let page: Awaited<ReturnType<Browser["newPage"]>> | null = null;
      try {
        context = await browser.createBrowserContext();
        page = await context.newPage();
        state.totalRenders += 1;
        return await fn(page);
      } catch (err) {
        lastError = err;
        // If Chromium crashed or disconnected mid-render, discard the stale browser
        // handle and retry once with a fresh instance before surfacing the error.
        if (attempt === 0 && (!browser.connected || !page)) {
          if (state.browser === browser) {
            state.browser = null;
          }
          try {
            await browser.close();
          } catch {
            // Already dead.
          }
          continue;
        }
        throw err;
      } finally {
        if (page) {
          await page.close().catch(() => undefined);
        }
        if (context) {
          await context.close().catch(() => undefined);
        }
      }
    }
    throw lastError;
  } finally {
    releaseRenderSlot();
  }
}

/**
 * Gracefully close the pooled Chromium instance (used on server shutdown,
 * idle timer expiration, recycle threshold, and test teardown).
 */
export async function closeHtmlPdfBrowser(): Promise<void> {
  const state = getPoolState();
  clearIdleTimer(state);
  const pending = state.launching;
  if (pending) {
    await pending.catch(() => undefined);
  }
  const browser = state.browser;
  state.browser = null;
  if (browser) {
    await browser.close().catch(() => undefined);
  }
}

/** Diagnostics snapshot for automated tests and operational health verification. */
export function getHtmlPdfPoolStats() {
  const state = getPoolState();
  return {
    connected: Boolean(state.browser?.connected),
    activeRenders: state.activeRenders,
    totalRenders: state.totalRenders,
    launchCount: state.launchCount,
  };
}
