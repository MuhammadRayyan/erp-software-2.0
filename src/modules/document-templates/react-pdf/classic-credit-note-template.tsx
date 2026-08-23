import { ClassicDocumentTemplate } from "./classic-document-template";
import type { TemplateSettings } from "../template-settings";
import type { CreditNoteTemplateData } from "./credit-note-template";

export function ClassicCreditNoteDocument({ data, settings }: { data: CreditNoteTemplateData; settings: TemplateSettings }) {
  return (
    <ClassicDocumentTemplate
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
