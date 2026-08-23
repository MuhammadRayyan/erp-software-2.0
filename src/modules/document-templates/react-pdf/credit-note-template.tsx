import { ModernDocumentTemplate, type DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type CreditNoteTemplateData = DocumentTemplateData;

export function CreditNoteDocument({ data, settings }: { data: CreditNoteTemplateData; settings: TemplateSettings }) {
  return (
    <ModernDocumentTemplate
      data={data}
      settings={settings}
      variant={{
        title: "CREDIT NOTE",
        partyLabel: "Credit To",
        showDueDate: false,
        showBuyerTrn: true,
        totalLabel: "Total Credit",
        showTax: true
      }}
    />
  );
}
