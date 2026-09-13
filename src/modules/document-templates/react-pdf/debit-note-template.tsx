import { ModernDocumentTemplate, type DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type DebitNoteTemplateData = DocumentTemplateData;

export function DebitNoteDocument({ data, settings }: { data: DebitNoteTemplateData; settings: TemplateSettings }) {
  return (
    <ModernDocumentTemplate
      data={data}
      settings={settings}
      variant={{
        title: "DEBIT NOTE",
        partyLabel: "Supplier",
        showDueDate: false,
        showBuyerTrn: true,
        totalLabel: "Total Credit",
        showTax: true
      }}
    />
  );
}
