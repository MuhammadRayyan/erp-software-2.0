"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpenText, CheckCircle2, CircleDollarSign, FileMinus2, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteInvoiceAction, duplicateInvoiceAction, postInvoiceAction, voidInvoiceAction } from "./actions";
import type { DocumentStatus } from "./invoice-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { DocumentEmailDialog, type DocumentEmailDefaults } from "@/modules/email/email-compose-dialog";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";

export function InvoiceViewActions({
  businessId,
  invoiceId,
  invoiceNumber,
  documentStatus,
  balanceMinor,
  totalMinor,
  hasDeliveryNotes,
  journalEntryId,
  reversalJournalEntryId,
  inventoryEnabled,
  hasDeliverableItems,
  emailDefaults,
}: {
  businessId: string;
  invoiceId: string;
  invoiceNumber: string;
  documentStatus: DocumentStatus;
  balanceMinor: number;
  totalMinor?: number;
  hasDeliveryNotes?: boolean;
  journalEntryId: string | null;
  reversalJournalEntryId?: string | null;
  inventoryEnabled: boolean;
  hasDeliverableItems: boolean;
  emailDefaults: DocumentEmailDefaults;
}) {
  const router = useRouter();
  const [emailOpen, setEmailOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const canReceive = documentStatus === "posted" && balanceMinor > 0;
  const canEdit = documentStatus !== "void" && !hasDeliveryNotes;
  const canVoid = documentStatus === "posted" && (totalMinor === undefined || balanceMinor === totalMinor);

  const handlePost = async () => {
    setPosting(true);
    try {
      const result = await postInvoiceAction(businessId, invoiceId);
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
      toast.success("Invoice posted to ledger.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <DocumentViewActions
        documentNumber={invoiceNumber}
        documentType="Invoice"
        editHref={canEdit ? `/b/${businessId}/sales/invoices/${invoiceId}/edit` : undefined}
        pdfHref={`/api/businesses/${businessId}/documents/sales-invoice/${invoiceId}/pdf`}
        onEmail={() => { setEmailOpen(true); }}
        copyToActions={documentStatus === "posted" ? [
          ...(canReceive ? [
            {
              label: "Customer Receipt",
              href: `/b/${businessId}/sales/receipts/new?invoiceId=${invoiceId}`,
              icon: CircleDollarSign,
            },
            {
              label: "Credit Note",
              href: `/b/${businessId}/sales/credit-notes/new?invoiceId=${invoiceId}`,
              icon: FileMinus2,
            },
          ] : []),
          ...(inventoryEnabled && hasDeliverableItems ? [
            {
              label: "Delivery Note",
              href: `/b/${businessId}/sales/delivery-notes/new?invoiceId=${invoiceId}`,
              icon: PackageCheck,
            },
          ] : []),
        ] : undefined}
        onDuplicate={async () => {
          const result = await duplicateInvoiceAction(businessId, invoiceId);
          if (result?.error) throw new Error(result.error);
        }}
        onVoid={canVoid ? {
          label: "Void",
          description: "This retains the invoice and creates a balanced reversing journal entry. An invoice with receipt allocations cannot be voided.",
          action: async () => {
            const result = await voidInvoiceAction(businessId, invoiceId);
            if (result.error) throw new Error(result.error);
            toast.success("Invoice voided with a reversing journal entry.");
            router.refresh();
          }
        } : undefined}
        onDelete={documentStatus === "draft" ? {
          label: "Delete draft",
          description: "This permanently removes the draft. Drafts have no ledger impact.",
          action: async () => {
            const result = await deleteInvoiceAction(businessId, invoiceId);
            if (result.error) throw new Error(result.error);
            toast.success("Draft invoice deleted.");
            router.push(`/b/${businessId}/sales/invoices`);
          }
        } : undefined}
        extraPrimaryActions={
          <>
            {documentStatus === "draft" && (
              <Button onClick={handlePost} disabled={posting} className="gap-1.5">
                <CheckCircle2 className={`size-4 ${posting ? "animate-spin" : ""}`} />
                Post Invoice
              </Button>
            )}
            {inventoryEnabled && hasDeliverableItems && documentStatus === "posted" && (
              <Button asChild variant="secondary">
                <Link href={`/b/${businessId}/sales/delivery-notes/new?invoiceId=${invoiceId}`}><PackageCheck className="mr-1.5 size-3.5" /> Create Delivery Note</Link>
              </Button>
            )}
            {canReceive && (
              <Button asChild variant="secondary">
                <Link href={`/b/${businessId}/sales/receipts/new?invoiceId=${invoiceId}`}><CircleDollarSign className="mr-1.5 size-3.5" /> Record Receipt</Link>
              </Button>
            )}
          </>
        }
        extraActions={
          <>
            {canReceive && (
              <DropdownMenuItem asChild>
                <Link href={`/b/${businessId}/sales/credit-notes/new?invoiceId=${invoiceId}`}><FileMinus2 className="size-4" /> Create Credit Note</Link>
              </DropdownMenuItem>
            )}
            {journalEntryId && (
              <DropdownMenuItem asChild>
                <Link href={`/b/${businessId}/accounting/journal/${journalEntryId}`}><BookOpenText className="size-4" /> View Journal Entry</Link>
              </DropdownMenuItem>
            )}
            {reversalJournalEntryId && (
              <DropdownMenuItem asChild>
                <Link href={`/b/${businessId}/accounting/journal/${reversalJournalEntryId}`}><BookOpenText className="size-4 text-danger" /> View Reversal Journal</Link>
              </DropdownMenuItem>
            )}
          </>
        }
      />
      <DocumentEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        businessId={businessId}
        documentId={invoiceId}
        documentType="sales-invoice"
        documentNumber={invoiceNumber}
        defaults={emailDefaults}
        pdfAvailable
      />
    </>
  );
}
