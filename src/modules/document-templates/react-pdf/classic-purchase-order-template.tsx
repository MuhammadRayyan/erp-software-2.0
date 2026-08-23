import { ClassicDocumentTemplate } from "./classic-document-template";
import type { TemplateSettings } from "../template-settings";
import type { PurchaseOrderTemplateData } from "./purchase-order-template";

export function ClassicPurchaseOrderDocument({ data, settings }: { data: PurchaseOrderTemplateData; settings: TemplateSettings }) {
  return (
    <ClassicDocumentTemplate
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
