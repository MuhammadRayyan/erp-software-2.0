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
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import { RecordPaymentSheet } from "@/components/documents/record-payment-sheet";

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
  autoOpenEmail,
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
  autoOpenEmail?: boolean;
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const canCreate = useActionPermission("create");
  const canEditPerm = useActionPermission("edit");
  const canCreateInventory = useActionPermission("create", "inventory");
  const canViewAccounting = useActionPermission("view", "accounting");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const [emailOpen, setEmailOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const canReceive = documentStatus === "posted" && balanceMinor > 0;
  const canEdit = documentStatus !== "void" && documentStatus !== "pending_approval" && !hasDeliveryNotes;
  const canVoid = documentStatus === "posted" && (totalMinor === undefined || balanceMinor === totalMinor);
  const showCreditNote = documentStatus === "posted" && canCreate;
  const showPost = documentStatus === "draft" && (mustSubmitForApproval ? canEditPerm : canPost);
  const showDelivery = inventoryEnabled && hasDeliverableItems && documentStatus === "posted" && canCreateInventory;
  const showReceive = canReceive && canCreate;
  const hasExtraPrimary = showPost || showDelivery || showReceive;
  const hasExtraActions = Boolean(showCreditNote || (canViewAccounting && (journalEntryId || reversalJournalEntryId)));

  const handlePost = async () => {
    setPosting(true);
    try {
      const result = await postInvoiceAction(
        businessId,
        invoiceId,
        mustSubmitForApproval ? "submit_approval" : "post",
      );
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
      toast.success(
        result.documentStatus === "pending_approval"
          ? "Invoice submitted for approval."
          : "Invoice posted to ledger.",
      );
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
        autoOpenEmail={autoOpenEmail}
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
          hasExtraPrimary ? (
            <>
              {documentStatus === "draft" && (
                <Button permission={mustSubmitForApproval ? "edit" : "post"} onClick={handlePost} disabled={posting} className="gap-1.5">
                  <CheckCircle2 className={`size-4 ${posting ? "animate-spin" : ""}`} />
                  {mustSubmitForApproval ? "Submit for Approval" : "Post Invoice"}
                </Button>
              )}
              {inventoryEnabled && hasDeliverableItems && documentStatus === "posted" && (
                <Button permission="create" permissionModule="inventory" asChild variant="secondary">
                  <Link href={`/b/${businessId}/sales/delivery-notes/new?invoiceId=${invoiceId}`}><PackageCheck className="mr-1.5 size-3.5" /> Create Delivery Note</Link>
                </Button>
              )}
              {canReceive && (
                <Button permission="create" variant="secondary" onClick={() => setPaymentOpen(true)}>
                  <CircleDollarSign className="mr-1.5 size-3.5" /> Record Receipt
                </Button>
              )}
            </>
          ) : undefined
        }
        extraActions={
          hasExtraActions ? (
            <>
              {showCreditNote && (
                <DropdownMenuItem permission="create" asChild>
                  <Link href={`/b/${businessId}/sales/credit-notes/new?invoiceId=${invoiceId}`}>
                    <FileMinus2 className="size-4" /> Create Credit Note
                  </Link>
                </DropdownMenuItem>
              )}
              {canViewAccounting && journalEntryId && (
                <DropdownMenuItem permission="view" permissionModule="accounting" asChild>
                  <Link href={`/b/${businessId}/accounting/journal/${journalEntryId}`}><BookOpenText className="size-4" /> View Journal Entry</Link>
                </DropdownMenuItem>
              )}
              {canViewAccounting && reversalJournalEntryId && (
                <DropdownMenuItem permission="view" permissionModule="accounting" asChild>
                  <Link href={`/b/${businessId}/accounting/journal/${reversalJournalEntryId}`}><BookOpenText className="size-4 text-danger" /> View Reversal Journal</Link>
                </DropdownMenuItem>
              )}
            </>
          ) : undefined
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
      {showReceive ? (
        <RecordPaymentSheet businessId={businessId} kind="receipt" documentId={invoiceId} open={paymentOpen} onOpenChange={setPaymentOpen} />
      ) : null}
    </>
  );
}
