
import { renderReactPdf } from "./react-pdf/render";
import { ModernDocumentTemplate, type DocumentTemplateData, type DocumentTemplateVariant } from "./react-pdf/modern-document-template";
import { ClassicDocumentTemplate } from "./react-pdf/classic-document-template";
import { ClassicStatementDocument, type StatementTemplateData } from "./react-pdf/statement-template";

import { renderHtmlTemplate } from "./html-templates/render";
import { getTemplateSettings } from "./template-service";

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
  data: DocumentTemplateData & { invoiceTitle?: string; customerLabel?: string }
): Promise<Buffer> {
  const settings = getTemplateSettings(businessId, userId, documentType);

  if (settings.templateType === "custom-html" && settings.customHtml) {
    return renderHtmlTemplate(settings.customHtml, data, settings);
  }

  const showDueDate = ["sales-invoice", "purchase-invoice", "sales-quote", "purchase-quote", "sales-order", "purchase-order"].includes(documentType);
  const showTax = ["sales-invoice", "purchase-invoice", "sales-quote", "purchase-quote", "sales-order", "purchase-order", "sales-credit-note", "debit-note"].includes(documentType);
  const showBuyerTrn = ["sales-invoice", "sales-quote", "sales-order", "sales-credit-note"].includes(documentType);
  
  const variant: DocumentTemplateVariant = {
    title: data.invoiceTitle || "DOCUMENT",
    partyLabel: data.customerLabel || "PARTY",
    showDueDate,
    showBuyerTrn,
    totalLabel: "Total",
    showTax
  };

  if (settings.templateType === "classic") {
    return renderReactPdf(<ClassicDocumentTemplate data={data} settings={settings} variant={variant} />);
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

