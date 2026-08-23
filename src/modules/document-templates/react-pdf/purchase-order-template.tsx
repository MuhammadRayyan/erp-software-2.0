import { ModernDocumentTemplate, type DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type PurchaseOrderTemplateData = DocumentTemplateData;

export function PurchaseOrderDocument({ data, settings }: { data: PurchaseOrderTemplateData; settings: TemplateSettings }) {
  return (
    <ModernDocumentTemplate
      data={data}
      settings={settings}
      variant={{
        title: "PURCHASE ORDER",
        partyLabel: "Supplier",
        showDueDate: false,
        showBuyerTrn: false,
        totalLabel: "Total",
        showTax: true
      }}
    />
  );
}
