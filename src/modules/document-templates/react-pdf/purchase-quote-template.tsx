import { ModernDocumentTemplate, type DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type PurchaseQuoteTemplateData = DocumentTemplateData;

export function PurchaseQuoteDocument({ data, settings }: { data: PurchaseQuoteTemplateData; settings: TemplateSettings }) {
  return (
    <ModernDocumentTemplate
      data={data}
      settings={settings}
      variant={{
        title: "PURCHASE QUOTE",
        partyLabel: "Supplier",
        showDueDate: true,
        showBuyerTrn: true,
        totalLabel: "Total",
        showTax: true
      }}
    />
  );
}
