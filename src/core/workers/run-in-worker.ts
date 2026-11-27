import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { WorkerToMainMessage, WorkerTaskInput } from "./worker-protocol";

/**
 * Runs CPU-heavy or synchronous-SQLite jobs on a worker thread so the main
 * event loop keeps serving HTTP requests.
 *
 * - One fresh worker per task: no stale module caches, and terminate() is a
 *   complete cleanup (better-sqlite3 closes its handles on thread exit, rolling
 *   back any open transaction).
 * - Bounded concurrency (ERP_WORKER_CONCURRENCY, default 1) with a bounded
 *   wait queue (ERP_WORKER_MAX_QUEUE, default 16). State lives on globalThis
 *   because Next.js may load this module once per route bundle.
 * - Per-task timeout and AbortSignal both terminate the worker.
 * - Errors thrown in the worker are rethrown here with their message, name
 *   and code preserved.
 *
 * Entry resolution: production (NODE_ENV=production or ERP_WORKER_MODE=bundle)
 * loads the esbuild bundle `dist-workers/<name>.cjs` (built by
 * scripts/build-workers.mjs and traced into the standalone output). Dev and
 * tests load `src/core/workers/<name>.ts` through tsx. Both stub the
 * `server-only` marker package; extra export conditions (e.g. `react-server`)
 * can be added per entry or globally with ERP_WORKER_CONDITIONS.
 */

export type WorkerEntryName = "migration.worker" | "document-pdf.worker";

export type RunInWorkerOptions<TEvent = unknown> = {
  /** Milliseconds the task may run once started; the worker is terminated after. */
  timeoutMs?: number;
  /** Aborting terminates the worker (or drops the task while it is still queued). */
  signal?: AbortSignal;
  /** ArrayBuffers moved (not copied) into the worker; the caller must not use them afterwards. */
  transferList?: ArrayBuffer[];
  /** Streaming events posted by the worker before its final result. */
  onEvent?: (event: TEvent) => void;
  /** V8 heap limit for the worker. */
  maxOldGenerationSizeMb?: number;
};

export class WorkerBusyError extends Error {
  readonly code = "WORKER_BUSY";
  constructor() {
    super("The server is busy with other background jobs. Please try again in a minute.");
    this.name = "WorkerBusyError";
  }
}

/** Code-based check: Next.js may load this module once per route bundle, so `instanceof` is unreliable. */
export function isWorkerBusyError(error: unknown): error is WorkerBusyError {
  return error instanceof Error && (error as Error & { code?: unknown }).code === "WORKER_BUSY";
}

export class WorkerTimeoutError extends Error {
  readonly code = "WORKER_TIMEOUT";
  constructor(task: string, timeoutMs: number) {
    super(`Background job ${task} did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = "WorkerTimeoutError";
  }
}

function abortError(signal?: AbortSignal) {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function readPositiveInt(name: string, fallback: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
}

// ---------------------------------------------------------------------------
// Bounded concurrency (process-wide)

type PoolState = { active: number; waiting: Array<{ grant: () => void; signal?: AbortSignal; onAbort: () => void }> };
const POOL_KEY = Symbol.for("erp.workerPool");
const globalPool = globalThis as unknown as { [POOL_KEY]?: PoolState };

function getPool(): PoolState {
  globalPool[POOL_KEY] ??= { active: 0, waiting: [] };
  return globalPool[POOL_KEY];
}

export function getWorkerPoolStats() {
  const pool = getPool();
  return { active: pool.active, queued: pool.waiting.length, concurrency: readPositiveInt("ERP_WORKER_CONCURRENCY", 1, 4) };
}

function acquireSlot(signal?: AbortSignal): Promise<() => void> {
  const pool = getPool();
  const concurrency = readPositiveInt("ERP_WORKER_CONCURRENCY", 1, 4);
  const maxQueue = readPositiveInt("ERP_WORKER_MAX_QUEUE", 16, 1000);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    pool.active -= 1;
    const next = pool.waiting.shift();
    if (next) next.grant();
  };
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (pool.active < concurrency) {
    pool.active += 1;
    return Promise.resolve(release);
  }
  if (pool.waiting.length >= maxQueue) return Promise.reject(new WorkerBusyError());
  return new Promise((resolve, reject) => {
    const entry = {
      signal,
      grant: () => {
        signal?.removeEventListener("abort", entry.onAbort);
        pool.active += 1;
        resolve(release);
      },
      onAbort: () => {
        const index = pool.waiting.indexOf(entry);
        if (index >= 0) pool.waiting.splice(index, 1);
        reject(abortError(signal));
      },
    };
    signal?.addEventListener("abort", entry.onAbort, { once: true });
    pool.waiting.push(entry);
  });
}

// ---------------------------------------------------------------------------
// Entry resolution

const DEFAULT_ENTRY_CONDITIONS: Record<WorkerEntryName, string[]> = {
  // Server-only code paths; `react-server` mirrors how Next resolves route handlers.
  "migration.worker": ["react-server"],
  // @react-pdf/renderer needs the full (non react-server) React build.
  "document-pdf.worker": [],
};

function conditionsFor(entry: WorkerEntryName) {
  const extra = (process.env.ERP_WORKER_CONDITIONS ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_ENTRY_CONDITIONS[entry], ...extra])];
}

export function shouldUseBundledWorkers() {
  const mode = process.env.ERP_WORKER_MODE;
  if (mode === "bundle") return true;
  if (mode === "source") return false;
  return process.env.NODE_ENV === "production";
}

export function resolveWorkerEntry(entry: WorkerEntryName): { filename: string; execArgv: string[] } {
  const conditionFlags = conditionsFor(entry).map((condition) => `--conditions=${condition}`);
  const root = process.cwd();
  if (shouldUseBundledWorkers()) {
    const bundleDir = process.env.ERP_WORKER_BUNDLE_DIR || path.join(/*turbopackIgnore: true*/ root, "dist-workers");
    const filename = path.join(/*turbopackIgnore: true*/ bundleDir, `${entry}.cjs`);
    if (!existsSync(filename)) {
      throw new Error(`Worker bundle ${filename} is missing. Run "node scripts/build-workers.mjs" before "next build".`);
    }
    return { filename, execArgv: conditionFlags };
  }
  const sourceDir = path.join(/*turbopackIgnore: true*/ root, "src", "core", "workers");
  const filename = path.join(/*turbopackIgnore: true*/ sourceDir, `${entry}.ts`);
  const hooks = pathToFileURL(path.join(/*turbopackIgnore: true*/ sourceDir, "register-worker-hooks.mjs")).href;
  return { filename, execArgv: ["--import", "tsx", "--import", hooks, ...conditionFlags] };
}

// ---------------------------------------------------------------------------

/**
 * Runs `task` inside a fresh worker loaded from `entry` and resolves with the
 * value the worker's handler returns.
 */
export async function runInWorker<TResult, TEvent = unknown>(
  entry: WorkerEntryName,
  task: string,
  payload: unknown,
  options: RunInWorkerOptions<TEvent> = {},
): Promise<TResult> {
  const { signal, timeoutMs = 5 * 60_000, transferList = [], onEvent } = options;
  const release = await acquireSlot(signal);
  try {
    if (signal?.aborted) throw abortError(signal);
    const { filename, execArgv } = resolveWorkerEntry(entry);
    const workerData: WorkerTaskInput = { task, payload };
    const worker = new Worker(/*turbopackIgnore: true*/ filename, {
      workerData,
      transferList,
      execArgv,
      env: process.env,
      resourceLimits: {
        maxOldGenerationSizeMb:
          options.maxOldGenerationSizeMb ?? readPositiveInt("ERP_WORKER_MAX_OLD_GENERATION_MB", 1024, 4096),
      },
    });

    return await new Promise<TResult>((resolve, reject) => {
      let settled = false;
      const finish = (error: unknown, value?: TResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        // The worker is done or must stop; terminate() also covers a worker
        // that posted its result but still holds open handles.
        void worker.terminate().catch(() => undefined);
        if (error) reject(error);
        else resolve(value as TResult);
      };
      const onAbort = () => finish(abortError(signal));
      const timer = setTimeout(() => finish(new WorkerTimeoutError(task, timeoutMs)), timeoutMs);
      timer.unref?.();
      signal?.addEventListener("abort", onAbort, { once: true });

      worker.on("message", (message: WorkerToMainMessage) => {
        if (settled) return;
        if (message.kind === "event") {
          try {
            onEvent?.(message.value as TEvent);
          } catch (error) {
            finish(error);
          }
        } else if (message.kind === "result") {
          finish(null, message.value as TResult);
        } else if (message.kind === "error") {
          const error = new Error(message.error.message);
          error.name = message.error.name || "Error";
          if (message.error.code) (error as Error & { code?: string }).code = message.error.code;
          if (message.error.stack) error.stack = `${error.name}: ${error.message}\n    [worker ${task}]\n${message.error.stack.split("\n").slice(1).join("\n")}`;
          finish(error);
        }
      });
      worker.on("error", (error) => finish(error));
      worker.on("exit", (code) => {
        finish(new Error(`Background job ${task} stopped unexpectedly (exit code ${code}).`));
      });
    });
  } finally {
    release();
  }
}

/**
 * Returns an ArrayBuffer that can be put in a transfer list for `bytes`: the
 * underlying buffer when `bytes` owns all of it, otherwise a copy (so pooled
 * small Buffers are never detached).
 */
export function transferableBytes(bytes: Uint8Array): { buffer: ArrayBuffer; byteLength: number } {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return { buffer: bytes.buffer, byteLength: bytes.byteLength };
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return { buffer: copy, byteLength: bytes.byteLength };
}
