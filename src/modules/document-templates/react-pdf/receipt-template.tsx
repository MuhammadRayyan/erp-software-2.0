import { ModernDocumentTemplate, type DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type ReceiptTemplateData = DocumentTemplateData;

export function ReceiptDocument({ data, settings }: { data: ReceiptTemplateData; settings: TemplateSettings }) {
  return (
    <ModernDocumentTemplate
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
