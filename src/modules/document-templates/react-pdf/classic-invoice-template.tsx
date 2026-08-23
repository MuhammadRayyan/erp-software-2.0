import { ClassicDocumentTemplate } from "./classic-document-template";
import type { TemplateSettings } from "../template-settings";
import type { InvoiceTemplateData } from "./invoice-template";

export function ClassicInvoiceDocument({ data, settings }: { data: InvoiceTemplateData; settings: TemplateSettings }) {
  return (
    <ClassicDocumentTemplate
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
