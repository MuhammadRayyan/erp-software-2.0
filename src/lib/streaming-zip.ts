import path from "node:path";
import yazl from "yazl";

export type ZipStreamHelpers = {
  /** Signal checked by async producers so client aborts stop remaining work early. */
  isCancelled: () => boolean;
};

/**
 * Sanitize and deduplicate an archive entry filename within a single ZIP stream.
 */
export function deduplicateArchiveFilename(rawName: string, seen: Set<string>): string {
  const safeBase = path.posix
    .basename(rawName.replaceAll("\\", "/"))
    .replaceAll("\0", "")
    .trim() || "document.pdf";

  const baseKey = safeBase.toLowerCase();
  if (!seen.has(baseKey)) {
    seen.add(baseKey);
    return safeBase;
  }

  const ext = path.posix.extname(safeBase);
  const stem = ext ? safeBase.slice(0, -ext.length) : safeBase;
  let counter = 2;
  let candidate = `${stem} (${counter})${ext}`;
  while (seen.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem} (${counter})${ext}`;
  }
  seen.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Stream a `yazl.ZipFile` directly over a Web `ReadableStream<Uint8Array>` with
 * backpressure handling, abort signal cancellation, and guaranteed once-only
 * cleanup (important when temporary snapshot files sit behind `addFile()`).
 */
export function createStreamingZipStream({
  populate,
  onCleanup,
  signal,
}: {
  populate: (zip: yazl.ZipFile, helpers: ZipStreamHelpers) => Promise<void> | void;
  onCleanup?: () => void;
  signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const zip = new yazl.ZipFile();
  const output = zip.outputStream;
  let cleanedUp = false;
  let cancelled = Boolean(signal?.aborted);
  let closedOrErrored = false;

  const runCleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      onCleanup?.();
    } catch {
      // Cleanup failures must never mask stream errors or crash responses.
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        cancelled = true;
        runCleanup();
        if (!closedOrErrored) {
          closedOrErrored = true;
          try {
            controller.close();
          } catch {
            // Stream might already be closed.
          }
        }
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      output.on("data", (chunk: Buffer | Uint8Array | string) => {
        if (cancelled || closedOrErrored) return;
        const bytes =
          typeof chunk === "string"
            ? Buffer.from(chunk)
            : chunk instanceof Uint8Array
              ? chunk
              : new Uint8Array(chunk);
        controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          output.pause();
        }
      });

      output.once("end", () => {
        signal?.removeEventListener("abort", onAbort);
        runCleanup();
        if (!closedOrErrored) {
          closedOrErrored = true;
          controller.close();
        }
      });

      output.once("error", (err: unknown) => {
        signal?.removeEventListener("abort", onAbort);
        runCleanup();
        if (!closedOrErrored) {
          closedOrErrored = true;
          controller.error(err);
        }
      });

      output.once("close", () => {
        signal?.removeEventListener("abort", onAbort);
        runCleanup();
      });

      void Promise.resolve()
        .then(() => populate(zip, { isCancelled: () => cancelled }))
        .then(() => {
          if (!cancelled && !closedOrErrored) {
            zip.end();
          }
        })
        .catch((err: unknown) => {
          signal?.removeEventListener("abort", onAbort);
          runCleanup();
          if (!closedOrErrored) {
            closedOrErrored = true;
            controller.error(err);
          }
        });
    },

    pull() {
      if (!cancelled && !closedOrErrored) {
        output.resume();
      }
    },

    cancel() {
      cancelled = true;
      runCleanup();
      const destroyable = output as NodeJS.ReadableStream & { destroy?: () => void };
      destroyable.destroy?.();
    },
  });
}

/**
 * Collect a Web `ReadableStream<Uint8Array>` into a Node `Buffer`.
 * Used by backwards-compatible `exportBusinessBackup()` test callers while HTTP
 * handlers pipe the underlying stream straight into `Response`.
 */
export async function collectStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(chunks);
}
