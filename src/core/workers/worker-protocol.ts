import { isMainThread, parentPort, workerData } from "node:worker_threads";

/** Message shapes shared by run-in-worker.ts (main) and the *.worker.ts entries. */
export type WorkerTaskInput = { task: string; payload: unknown };

export type SerializedWorkerError = { name: string; message: string; code?: string; stack?: string };

export type WorkerToMainMessage =
  | { kind: "event"; value: unknown }
  | { kind: "result"; value: unknown }
  | { kind: "error"; error: SerializedWorkerError };

export type WorkerTaskContext = {
  /** Streams an intermediate value to the main thread (`onEvent`). */
  emit: (value: unknown, transferList?: ArrayBuffer[]) => void;
};

export type WorkerTaskHandler = (payload: never, context: WorkerTaskContext) => unknown;

function serializeError(error: unknown): SerializedWorkerError {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return { name: error.name, message: error.message, code: typeof code === "string" ? code : undefined, stack: error.stack };
  }
  return { name: "Error", message: String(error) };
}

/**
 * Worker-side entry point: runs the handler named by `workerData.task`, posts
 * its result (or error) and lets the thread exit.
 */
export function serveWorkerTask(handlers: Record<string, WorkerTaskHandler>) {
  if (isMainThread || !parentPort) throw new Error("serveWorkerTask must run inside a worker thread.");
  const port = parentPort;
  const { task, payload } = workerData as WorkerTaskInput;
  const context: WorkerTaskContext = {
    emit: (value, transferList) => port.postMessage({ kind: "event", value } satisfies WorkerToMainMessage, transferList),
  };
  void (async () => {
    try {
      const handler = handlers[task];
      if (!handler) throw new Error(`Unknown worker task: ${task}`);
      const value = await handler(payload as never, context);
      port.postMessage({ kind: "result", value } satisfies WorkerToMainMessage);
    } catch (error) {
      port.postMessage({ kind: "error", error: serializeError(error) } satisfies WorkerToMainMessage);
    }
  })();
}
