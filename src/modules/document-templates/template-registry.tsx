
import { renderReactPdf } from "./react-pdf/render";
import { ModernDocumentTemplate } from "./react-pdf/modern-document-template";
import { ClassicDocumentTemplate } from "./react-pdf/classic-document-template";
import { MinimalDocumentTemplate } from "./react-pdf/minimal-document-template";
import { ClassicStatementDocument, type StatementTemplateData } from "./react-pdf/statement-template";
import type { DocumentTemplateData, DocumentTemplateVariant } from "./types";
import { resolveDocumentVariant } from "./document-data-extractor";

import { renderHtmlTemplate } from "./html-templates/render";
import { getTemplateSettings } from "./template-service";
import { defaultSettings, templateSettingsSchema, type TemplateSettings } from "./template-settings";

export async function renderInvoicePdf(
  businessId: string,
  userId: string,
  data: DocumentTemplateData,
): Promise<Buffer> {
  // Legacy function for invoices
  return renderDocumentPdf(businessId, userId, "sales-invoice", { ...data, invoiceTitle: "INVOICE", customerLabel: "BILL TO" });
}

export async function renderDocumentPdf(
  businessId: string,
  userId: string,
  documentType: string,
  data: DocumentTemplateData & { invoiceTitle?: string; customerLabel?: string },
  overrideSettings?: Partial<TemplateSettings> | TemplateSettings,
): Promise<Buffer> {
  const base = overrideSettings ? { ...defaultSettings, ...overrideSettings } : getTemplateSettings(businessId, userId, documentType);
  const settings = templateSettingsSchema.parse(base);

  if (settings.templateType === "custom-html" && settings.customHtml) {
    return renderHtmlTemplate(settings.customHtml, data, settings);
  }

  const variant: DocumentTemplateVariant = resolveDocumentVariant(documentType, settings, data);

  if (settings.templateType === "classic") {
    return renderReactPdf(<ClassicDocumentTemplate data={data} settings={settings} variant={variant} />);
  }

  if (settings.templateType === "minimal") {
    return renderReactPdf(<MinimalDocumentTemplate data={data} settings={settings} variant={variant} />);
  }

  return renderReactPdf(<ModernDocumentTemplate data={data} settings={settings} variant={variant} />);
}

export async function renderStatementPdf(
  businessId: string,
  userId: string,
  data: StatementTemplateData,
): Promise<Buffer> {
  const settings = getTemplateSettings(businessId, userId, "sales-invoice");
  
  // For statement we just use the classic layout
  return renderReactPdf(<ClassicStatementDocument data={data} settings={settings} />);
}

