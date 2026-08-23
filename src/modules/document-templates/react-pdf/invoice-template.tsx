import { ModernDocumentTemplate, type DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type InvoiceTemplateData = DocumentTemplateData;

export function InvoiceDocument({ data, settings }: { data: InvoiceTemplateData; settings: TemplateSettings }) {
  return (
    <ModernDocumentTemplate
      data={data}
      settings={settings}
      variant={{
        title: "INVOICE",
        partyLabel: "Bill To",
        showDueDate: true,
        showBuyerTrn: true,
        totalLabel: "Total",
        showTax: true
      }}
    />
  );
}
