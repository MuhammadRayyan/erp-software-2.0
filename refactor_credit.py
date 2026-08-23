file_path = "src/modules/sales-credit-notes/credit-note-view-actions.tsx"
new_content = """"use client";

import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteCreditNoteAction, duplicateCreditNoteAction, voidCreditNoteAction } from "./actions";
import type { CreditNoteStatus } from "./credit-note-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function CreditNoteViewActions({
  businessId,
  noteId,
  creditNoteNumber,
  documentStatus,
  journalEntryId,
  eInvoiceLocked,
}: {
  businessId: string;
  noteId: string;
  creditNoteNumber: string;
  documentStatus: CreditNoteStatus;
  journalEntryId: string | null;
  eInvoiceLocked: boolean;
}) {
  const router = useRouter();

  return (
    <DocumentViewActions
      documentNumber={creditNoteNumber}
      documentType="Credit Note"
      editHref={documentStatus !== "void" && !eInvoiceLocked ? `/b/${businessId}/sales/credit-notes/${noteId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/credit-notes/${noteId}/pdf`}
      onDuplicate={async () => {
        const result = await duplicateCreditNoteAction(businessId, noteId);
        if (result?.error) throw new Error(result.error);
      }}
      onVoid={documentStatus === "posted" && !eInvoiceLocked ? {
        label: "Void",
        description: "This retains the credit note and creates a balanced reversing journal entry. A credit note with refund allocations cannot be voided.",
        action: async () => {
          const result = await voidCreditNoteAction(businessId, noteId);
          if (result.error) throw new Error(result.error);
          toast.success("Credit note voided.");
          router.refresh();
        }
      } : undefined}
      onDelete={documentStatus === "draft" ? {
        label: "Delete draft",
        description: "This permanently removes the draft.",
        action: async () => {
          const result = await deleteCreditNoteAction(businessId, noteId);
          if (result.error) throw new Error(result.error);
          toast.success("Draft credit note deleted.");
          router.push(`/b/${businessId}/sales/credit-notes`);
        }
      } : undefined}
      extraActions={
        <>
          {journalEntryId && (
            <DropdownMenuItem asChild>
              <Link href={`/b/${businessId}/accounting/journal/${journalEntryId}`}><BookOpenText className="size-4" /> View Journal Entry</Link>
            </DropdownMenuItem>
          )}
        </>
      }
    />
  );
}
"""
with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
