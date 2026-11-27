import type { ManagerImportOptions, ManagerImportResult, ManagerInspectionSummary } from "@/modules/migration/manager-importer";
import type { DocumentTemplateData } from "@/modules/document-templates/types";
import type { TemplateSettings } from "@/modules/document-templates/template-settings";
import { runInWorker, transferableBytes } from "./run-in-worker";

/**
 * Main-thread clients for the worker jobs. Routes call these instead of the
 * synchronous services, which stay unchanged (and are what the workers run).
 *
 * `transfer: true` moves the upload's memory into the worker instead of
 * copying it; the caller's buffer is unusable afterwards.
 */
type ByteJobOptions = { transfer?: boolean; signal?: AbortSignal; timeoutMs?: number };

const INSPECT_TIMEOUT_MS = 60_000;
const IMPORT_TIMEOUT_MS = 10 * 60_000;
const BATCH_PDF_TIMEOUT_MS = 10 * 60_000;

function bytesPayload(bytes: Uint8Array, transfer?: boolean) {
  if (transfer) {
    const moved = transferableBytes(bytes);
    return { bytes: moved, transferList: [moved.buffer] };
  }
  // Structured clone copies the bytes; the caller keeps its buffer.
  const copy = new Uint8Array(bytes);
  return { bytes: { buffer: copy.buffer, byteLength: copy.byteLength }, transferList: [copy.buffer] };
}

export function inspectManagerBackupInWorker(bytes: Uint8Array, options: ByteJobOptions = {}) {
  const { bytes: payloadBytes, transferList } = bytesPayload(bytes, options.transfer);
  return runInWorker<ManagerInspectionSummary>("migration.worker", "manager.inspect", { bytes: payloadBytes }, {
    transferList, signal: options.signal, timeoutMs: options.timeoutMs ?? INSPECT_TIMEOUT_MS,
  });
}

/**
 * Not cancellable by the client on purpose: the import runs in one SQLite
 * transaction and a half-way abort would leave an empty workspace behind.
 */
export function importManagerBackupInWorker(
  bytes: Uint8Array,
  userId: string,
  importOptions: ManagerImportOptions,
  options: Omit<ByteJobOptions, "signal"> = {},
) {
  const { bytes: payloadBytes, transferList } = bytesPayload(bytes, options.transfer);
  return runInWorker<ManagerImportResult>("migration.worker", "manager.import", { bytes: payloadBytes, userId, options: importOptions }, {
    transferList, timeoutMs: options.timeoutMs ?? IMPORT_TIMEOUT_MS,
  });
}

export function inspectBackupArchiveInWorker(bytes: Uint8Array, options: ByteJobOptions = {}) {
  const { bytes: payloadBytes, transferList } = bytesPayload(bytes, options.transfer);
  return runInWorker<unknown>("migration.worker", "backup.inspect", { bytes: payloadBytes }, {
    transferList, signal: options.signal, timeoutMs: options.timeoutMs ?? INSPECT_TIMEOUT_MS,
  });
}

/** Restores a native .erpbackup (integrity check, schema validation, attachments) off the main thread. */
export function importBusinessBackupInWorker(bytes: Uint8Array, userId: string, options: Omit<ByteJobOptions, "signal"> = {}) {
  const { bytes: payloadBytes, transferList } = bytesPayload(bytes, options.transfer);
  return runInWorker<string>("migration.worker", "backup.import", { bytes: payloadBytes, userId }, {
    transferList, timeoutMs: options.timeoutMs ?? IMPORT_TIMEOUT_MS,
  });
}

// ---------------------------------------------------------------------------
// Batch document PDFs

export type BatchDocumentPdfPayload = {
  businessId: string;
  userId: string;
  businessName: string;
  baseCurrency: string;
  documentType: string;
  documentIds: string[];
};

/** Posted by document-pdf.worker.ts once per document. */
export type BatchDocumentPdfEvent =
  | { ok: true; kind: "pdf"; documentId: string; filename: string; pdf: Uint8Array }
  | { ok: true; kind: "html"; documentId: string; filename: string; template: string; data: DocumentTemplateData; settings: TemplateSettings }
  | { ok: false; documentId: string; error: string };

export type BatchDocumentPdfItem =
  | { ok: true; documentId: string; filename: string; pdf: Buffer }
  | { ok: false; documentId: string; error: string };

/**
 * Yields one PDF per document id, in order. Data extraction and React-PDF
 * layout run in a worker; custom-HTML templates are printed by the shared
 * Chromium pool here (Chromium itself is a separate process). Breaking out of
 * the loop, or aborting `signal`, terminates the worker.
 */
export async function* generateDocumentPdfsInWorker(
  payload: BatchDocumentPdfPayload,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): AsyncGenerator<BatchDocumentPdfItem> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });

  const queue: BatchDocumentPdfEvent[] = [];
  let wake: (() => void) | null = null;
  let done = false;
  let failure: unknown = null;
  const notify = () => {
    const resume = wake;
    wake = null;
    resume?.();
  };

  const run = runInWorker<{ produced: number }, BatchDocumentPdfEvent>("document-pdf.worker", "documents.pdf-batch", payload, {
    signal: controller.signal,
    timeoutMs: options.timeoutMs ?? BATCH_PDF_TIMEOUT_MS,
    onEvent: (event) => {
      queue.push(event);
      notify();
    },
  }).then(
    () => { done = true; notify(); },
    (error) => { failure = error; done = true; notify(); },
  );

  try {
    while (true) {
      const event = queue.shift();
      if (event) {
        if (!event.ok) {
          yield event;
        } else if (event.kind === "pdf") {
          yield { ok: true, documentId: event.documentId, filename: event.filename, pdf: Buffer.from(event.pdf.buffer, event.pdf.byteOffset, event.pdf.byteLength) };
        } else {
          let item: BatchDocumentPdfItem;
          try {
            const { renderHtmlTemplate } = await import("@/modules/document-templates/html-templates/render");
            const pdf = await renderHtmlTemplate(event.template, event.data, event.settings);
            item = { ok: true, documentId: event.documentId, filename: event.filename, pdf: Buffer.from(pdf) };
          } catch (error) {
            item = { ok: false, documentId: event.documentId, error: error instanceof Error ? error.message : String(error) };
          }
          yield item;
        }
        continue;
      }
      if (done) break;
      await new Promise<void>((resolve) => { wake = resolve; });
    }
    if (failure && !controller.signal.aborted) throw failure;
  } finally {
    options.signal?.removeEventListener("abort", forwardAbort);
    if (!done) controller.abort();
    await run;
  }
}
