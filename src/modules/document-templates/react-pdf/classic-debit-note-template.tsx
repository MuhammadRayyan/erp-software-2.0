import { ClassicDocumentTemplate } from "./classic-document-template";
import type { DocumentTemplateData } from "./modern-document-template";
import type { TemplateSettings } from "../template-settings";

export type DebitNoteTemplateData = DocumentTemplateData;

export function ClassicDebitNoteDocument({ data, settings }: { data: DebitNoteTemplateData; settings: TemplateSettings }) {
  return (
    <ClassicDocumentTemplate
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
