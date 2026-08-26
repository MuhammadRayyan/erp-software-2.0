"use client";

import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteDebitNoteAction, duplicateDebitNoteAction, voidDebitNoteAction } from "./actions";
import type { DebitNoteStatus } from "./debit-note-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function DebitNoteViewActions({
  businessId,
  noteId,
  debitNoteNumber,
  documentStatus,
  journalEntryId,
  eInvoiceLocked,
}: {
  businessId: string;
  noteId: string;
  debitNoteNumber: string;
  documentStatus: DebitNoteStatus;
  journalEntryId: string | null;
  eInvoiceLocked: boolean;
}) {
  const router = useRouter();

  return (
    <DocumentViewActions
      documentNumber={debitNoteNumber}
      documentType="Debit Note"
      editHref={documentStatus !== "void" && !eInvoiceLocked ? `/b/${businessId}/sales/debit-notes/${noteId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/debit-notes/${noteId}/pdf`}
      onDuplicate={async () => {
        const result = await duplicateDebitNoteAction(businessId, noteId);
        if (result?.error) throw new Error(result.error);
      }}
      onVoid={documentStatus === "posted" && !eInvoiceLocked ? {
        label: "Void",
        description: "This retains the credit note and creates a balanced reversing journal entry. A credit note with refund allocations cannot be voided.",
        action: async () => {
          const result = await voidDebitNoteAction(businessId, noteId);
          if (result.error) throw new Error(result.error);
          toast.success("Credit note voided.");
          router.refresh();
        }
      } : undefined}
      onDelete={documentStatus === "draft" ? {
        label: "Delete draft",
        description: "This permanently removes the draft.",
        action: async () => {
          const result = await deleteDebitNoteAction(businessId, noteId);
          if (result.error) throw new Error(result.error);
          toast.success("Draft credit note deleted.");
          router.push(`/b/${businessId}/sales/debit-notes`);
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
