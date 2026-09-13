import { renderReactPdf } from "./react-pdf/render";
import { InvoiceDocument, type InvoiceTemplateData } from "./react-pdf/invoice-template";
import { CreditNoteDocument } from "./react-pdf/credit-note-template";
import { PurchaseOrderDocument } from "./react-pdf/purchase-order-template";
import { ReceiptDocument } from "./react-pdf/receipt-template";
import { DebitNoteDocument } from "./react-pdf/debit-note-template";
import { SalesQuoteDocument } from "./react-pdf/sales-quote-template";
import { PurchaseQuoteDocument } from "./react-pdf/purchase-quote-template";

import { ClassicInvoiceDocument } from "./react-pdf/classic-invoice-template";
import { ClassicCreditNoteDocument } from "./react-pdf/classic-credit-note-template";
import { ClassicPurchaseOrderDocument } from "./react-pdf/classic-purchase-order-template";
import { ClassicReceiptDocument } from "./react-pdf/classic-receipt-template";
import { ClassicDebitNoteDocument } from "./react-pdf/classic-debit-note-template";
import { ClassicSalesQuoteDocument } from "./react-pdf/classic-sales-quote-template";
import { ClassicPurchaseQuoteDocument } from "./react-pdf/classic-purchase-quote-template";
import { ClassicStatementDocument, type StatementTemplateData } from "./react-pdf/statement-template";

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
  
  if (settings.templateType === "classic") {
    return renderReactPdf(<ClassicInvoiceDocument data={data} settings={settings} />);
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

  if (settings.templateType === "classic") {
    if (documentType === "sales-invoice") {
      return renderReactPdf(<ClassicInvoiceDocument data={data} settings={settings} />);
    } else if (documentType === "sales-credit-note") {
      return renderReactPdf(<ClassicCreditNoteDocument data={data} settings={settings} />);
    } else if (documentType === "purchase-order") {
      return renderReactPdf(<ClassicPurchaseOrderDocument data={data} settings={settings} />);
    } else if (documentType === "debit-note") {
      return renderReactPdf(<ClassicDebitNoteDocument data={data} settings={settings} />);
    } else if (documentType === "sales-quote") {
      return renderReactPdf(<ClassicSalesQuoteDocument data={data} settings={settings} />);
    } else if (documentType === "purchase-quote") {
      return renderReactPdf(<ClassicPurchaseQuoteDocument data={data} settings={settings} />);
    } else {
      return renderReactPdf(<ClassicReceiptDocument data={data} settings={settings} />);
    }
  }

  if (documentType === "sales-invoice") {
    return renderReactPdf(<InvoiceDocument data={data} settings={settings} />);
  } else if (documentType === "sales-credit-note") {
    return renderReactPdf(<CreditNoteDocument data={data} settings={settings} />);
  } else if (documentType === "purchase-order") {
    return renderReactPdf(<PurchaseOrderDocument data={data} settings={settings} />);
  } else if (documentType === "debit-note") {
    return renderReactPdf(<DebitNoteDocument data={data} settings={settings} />);
  } else if (documentType === "sales-quote") {
    return renderReactPdf(<SalesQuoteDocument data={data} settings={settings} />);
  } else if (documentType === "purchase-quote") {
    return renderReactPdf(<PurchaseQuoteDocument data={data} settings={settings} />);
  } else {
    return renderReactPdf(<ReceiptDocument data={data} settings={settings} />);
  }
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
