/**
 * Worker entry for batch document PDFs (see run-in-worker.ts).
 *
 * Built-in templates are laid out by @react-pdf/renderer, which is pure
 * JavaScript and would otherwise hold the main event loop for ~60 ms per
 * document; that render happens here. Custom-HTML templates are printed by
 * the shared headless Chromium pool, which lives on the main thread (one
 * browser per process): for those this worker only extracts the document
 * data and the main thread hands it to renderHtmlTemplate().
 */
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getDocumentPdfModule } from "@/core/permissions/document-pdf-access";
import { buildDocumentTemplateData } from "@/modules/document-templates/document-data-extractor";
import { generateDocumentPdf } from "@/modules/document-templates/pdf-service";
import { getTemplateSettings } from "@/modules/document-templates/template-service";
import { templateSettingsSchema } from "@/modules/document-templates/template-settings";
import { serveWorkerTask } from "./worker-protocol";
import type { BatchDocumentPdfEvent, BatchDocumentPdfPayload } from "./jobs";

serveWorkerTask({
  "documents.pdf-batch": async (payload: BatchDocumentPdfPayload, { emit }) => {
    const { businessId, userId, businessName, baseCurrency, documentType, documentIds } = payload;
    const requiredModule = getDocumentPdfModule(documentType);
    if (!requiredModule) throw new Error("Unsupported document type.");
    assertMutationPermission(businessId, userId, requiredModule, "export");

    // Same resolution as renderDocumentPdf(): per-type settings, falling back to the sales-invoice branding.
    const settings = templateSettingsSchema.parse(getTemplateSettings(businessId, userId, documentType));
    const customHtml = settings.templateType === "custom-html" && settings.customHtml ? settings.customHtml : null;

    let produced = 0;
    for (const documentId of documentIds) {
      let event: BatchDocumentPdfEvent;
      const transfer: ArrayBuffer[] = [];
      try {
        if (customHtml) {
          assertMutationPermission(businessId, userId, requiredModule, "export");
          const { data, filename } = buildDocumentTemplateData(businessId, userId, businessName, baseCurrency, documentType, documentId);
          event = { ok: true, kind: "html", documentId, filename, template: customHtml, data, settings };
        } else {
          const { pdf, filename } = await generateDocumentPdf(businessId, userId, businessName, baseCurrency, documentType, documentId);
          const bytes = new Uint8Array(pdf.byteLength);
          bytes.set(pdf);
          transfer.push(bytes.buffer);
          event = { ok: true, kind: "pdf", documentId, filename, pdf: bytes };
        }
        produced += 1;
      } catch (error) {
        event = { ok: false, documentId, error: error instanceof Error ? error.message : String(error) };
      }
      emit(event, transfer);
    }
    return { produced };
  },
});
