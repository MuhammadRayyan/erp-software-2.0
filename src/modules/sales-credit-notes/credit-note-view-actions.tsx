"use client";

import Link from "next/link";
import { BookOpenText, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteCreditNoteAction, duplicateCreditNoteAction, voidCreditNoteAction } from "./actions";
import type { CreditNoteStatus } from "./credit-note-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { DocumentEmailDialog, type DocumentEmailDefaults } from "@/modules/email/email-compose-dialog";
import { useState } from "react";

export function CreditNoteViewActions({
  businessId,
  noteId,
  creditNoteNumber,
  documentStatus,
  journalEntryId,
  emailDefaults,
}: {
  businessId: string;
  noteId: string;
  creditNoteNumber: string;
  documentStatus: CreditNoteStatus;
  journalEntryId: string | null;
  emailDefaults: DocumentEmailDefaults;
}) {
  const router = useRouter();
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <>
      <DocumentViewActions
        documentNumber={creditNoteNumber}
        documentType="Credit Note"
        editHref={documentStatus !== "void" ? `/b/${businessId}/sales/credit-notes/${noteId}/edit` : undefined}
        pdfHref={`/api/businesses/${businessId}/documents/sales-credit-note/${noteId}/pdf`}
        onEmail={() => setEmailOpen(true)}
        onDuplicate={async () => {
          const result = await duplicateCreditNoteAction(businessId, noteId);
          if (result?.error) throw new Error(result.error);
        }}
        onVoid={documentStatus === "posted" ? {
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
        extraPrimaryActions={
          <Button variant="secondary" onClick={() => setEmailOpen(true)}>
            <Mail className="mr-1.5 size-3.5" /> Email
          </Button>
        }
        extraActions={
          <>
            <DropdownMenuItem onSelect={() => setEmailOpen(true)}>
              <Mail className="size-4 mr-2" /> Email
            </DropdownMenuItem>
            {journalEntryId && (
              <DropdownMenuItem asChild>
                <Link href={`/b/${businessId}/accounting/journal/${journalEntryId}`}><BookOpenText className="size-4" /> View Journal Entry</Link>
              </DropdownMenuItem>
            )}
          </>
        }
      />
      <DocumentEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        businessId={businessId}
        documentType="sales-credit-note"
        documentId={noteId}
        documentNumber={creditNoteNumber}
        defaults={emailDefaults}
        pdfAvailable
      />
    </>
  );
}
