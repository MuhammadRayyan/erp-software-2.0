import { renderReactPdf } from "./react-pdf/render";
import { InvoiceDocument, type InvoiceTemplateData } from "./react-pdf/invoice-template";
import { CreditNoteDocument } from "./react-pdf/credit-note-template";
import { PurchaseOrderDocument } from "./react-pdf/purchase-order-template";
import { ReceiptDocument } from "./react-pdf/receipt-template";
import { renderHtmlTemplate } from "./html-templates/render";
import { getTemplateSettings } from "./template-service";

export async function renderInvoicePdf(
  businessId: string,
  userId: string,
  data: InvoiceTemplateData,
): Promise<Buffer> {
  const settings = getTemplateSettings(businessId, userId, "sales-invoice");

  if (settings.templateType === "custom-html" && settings.customHtml) {
    return renderHtmlTemplate(settings.customHtml, data, settings);
  }

  return renderReactPdf(<InvoiceDocument data={data} settings={settings} />);
}

export async function renderDocumentPdf(
  businessId: string,
  userId: string,
  documentType: string,
  data: InvoiceTemplateData & { invoiceTitle?: string; customerLabel?: string }
): Promise<Buffer> {
  const settings = getTemplateSettings(businessId, userId, documentType);

  if (settings.templateType === "custom-html" && settings.customHtml) {
    return renderHtmlTemplate(settings.customHtml, data, settings);
  }

  if (documentType === "sales-credit-note") {
    return renderReactPdf(<CreditNoteDocument data={data} settings={settings} />);
  } else if (documentType === "purchase-order") {
    return renderReactPdf(<PurchaseOrderDocument data={data} settings={settings} />);
  } else {
    return renderReactPdf(<ReceiptDocument data={data} settings={settings} />);
  }
}
