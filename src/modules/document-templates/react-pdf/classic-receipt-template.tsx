import { ClassicDocumentTemplate } from "./classic-document-template";
import type { TemplateSettings } from "../template-settings";
import type { DocumentTemplateData } from "./modern-document-template";

export function ClassicReceiptDocument({ data, settings }: { data: DocumentTemplateData; settings: TemplateSettings }) {
  return (
    <ClassicDocumentTemplate
      data={data}
      settings={settings}
      variant={{
        title: "RECEIPT",
        partyLabel: "Received From",
        showDueDate: false,
        showBuyerTrn: true,
        totalLabel: "Amount Received",
        showTax: false
      }}
    />
  );
}
