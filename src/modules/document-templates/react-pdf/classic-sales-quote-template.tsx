import { ClassicDocumentTemplate } from "./classic-document-template";
import type { DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type SalesQuoteTemplateData = DocumentTemplateData;

export function ClassicSalesQuoteDocument({ data, settings }: { data: SalesQuoteTemplateData; settings: TemplateSettings }) {
  return (
    <ClassicDocumentTemplate
      data={data}
      settings={settings}
      variant={{
        title: "SALES QUOTE",
        partyLabel: "Customer",
        showDueDate: true,
        showBuyerTrn: true,
        totalLabel: "Total",
        showTax: true
      }}
    />
  );
}
