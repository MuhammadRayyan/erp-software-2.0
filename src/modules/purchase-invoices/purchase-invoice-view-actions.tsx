"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpenText, CheckCircle2, CircleDollarSign, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deletePurchaseInvoiceAction, duplicatePurchaseInvoiceAction, postPurchaseInvoiceAction, voidPurchaseInvoiceAction } from "./actions";
import type { PurchaseInvoiceStatus } from "./purchase-invoice-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";

export function PurchaseInvoiceViewActions({
  businessId, invoiceId, internalNumber, documentStatus, balanceMinor, totalMinor, journalEntryId, reversalJournalEntryId, inventoryEnabled, hasInventoryLines, hasGoodsReceipts = false
}: {
  businessId: string; invoiceId: string; internalNumber: string; documentStatus: PurchaseInvoiceStatus; balanceMinor: number; totalMinor?: number; journalEntryId: string | null; reversalJournalEntryId?: string | null; inventoryEnabled: boolean; hasInventoryLines: boolean; hasGoodsReceipts?: boolean;
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const canCreate = useActionPermission("create");
  const canEditPerm = useActionPermission("edit");
  const canCreateInventory = useActionPermission("create", "inventory");
  const canViewAccounting = useActionPermission("view", "accounting");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const [posting, setPosting] = useState(false);

  const canEdit = documentStatus !== "void" && documentStatus !== "pending_approval" && !hasGoodsReceipts && (documentStatus === "draft" || totalMinor === undefined || balanceMinor === totalMinor);
  const canVoid = documentStatus === "posted" && (totalMinor === undefined || balanceMinor === totalMinor);
  const showDebitNote = documentStatus === "posted" && canCreate;
  const showPost = documentStatus === "draft" && (mustSubmitForApproval ? canEditPerm : canPost);
  const showReceiveGoods = inventoryEnabled && hasInventoryLines && documentStatus === "posted" && canCreateInventory;
  const showRecordPayment = documentStatus === "posted" && balanceMinor > 0 && canCreate;
  const hasExtraPrimary = showPost || showReceiveGoods || showRecordPayment;
  const hasExtraActions = Boolean(showDebitNote || (canViewAccounting && (journalEntryId || reversalJournalEntryId)));

  const handlePost = async () => {
    setPosting(true);
    try {
      const result = await postPurchaseInvoiceAction(
        businessId,
        invoiceId,
        mustSubmitForApproval ? "submit_approval" : "post",
      );
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
      toast.success(
        result.documentStatus === "pending_approval"
          ? "Purchase bill submitted for approval."
          : "Purchase bill posted to ledger.",
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <DocumentViewActions
      documentNumber={internalNumber}
      documentType="Bill"
      editHref={canEdit ? `/b/${businessId}/purchases/invoices/${invoiceId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/documents/purchase-invoice/${invoiceId}/pdf`}
      onDuplicate={async () => {
        const result = await duplicatePurchaseInvoiceAction(businessId, invoiceId);
        if (result?.error) throw new Error(result.error);
      }}
      onVoid={canVoid ? {
        label: "Void",
        description: "This retains the bill and creates a balanced reversing journal. Bills with payment allocations cannot be voided.",
        action: async () => {
          const result = await voidPurchaseInvoiceAction(businessId, invoiceId);
          if (result.error) throw new Error(result.error);
          toast.success("Purchase invoice voided with a reversing journal.");
          router.refresh();
        }
      } : undefined}
      onDelete={documentStatus === "draft" ? {
        label: "Delete draft",
        description: "This permanently removes the non-posting draft.",
        action: async () => {
          const result = await deletePurchaseInvoiceAction(businessId, invoiceId);
          if (result.error) throw new Error(result.error);
          toast.success("Draft purchase invoice deleted.");
          router.push(`/b/${businessId}/purchases/invoices`);
        }
      } : undefined}
      extraPrimaryActions={
        hasExtraPrimary ? (
          <>
            {documentStatus === "draft" && (
              <Button permission={mustSubmitForApproval ? "edit" : "post"} onClick={handlePost} disabled={posting} className="gap-1.5">
                <CheckCircle2 className={`size-4 ${posting ? "animate-spin" : ""}`} />
                {mustSubmitForApproval ? "Submit for Approval" : "Post Bill"}
              </Button>
            )}
            {inventoryEnabled && hasInventoryLines && documentStatus === "posted" && (
              <Button permission="create" permissionModule="inventory" asChild variant="secondary">
                <Link href={`/b/${businessId}/purchases/goods-receipts/new?invoiceId=${invoiceId}`}><PackagePlus className="size-4" /> Receive Goods</Link>
              </Button>
            )}
            {documentStatus === "posted" && balanceMinor > 0 && (
              <Button permission="create" asChild variant="secondary">
                <Link href={`/b/${businessId}/purchases/payments/new?invoiceId=${invoiceId}`}><CircleDollarSign className="size-4" /> Record Payment</Link>
              </Button>
            )}
          </>
        ) : undefined
      }
      extraActions={
        hasExtraActions ? (
          <>
            {showDebitNote && (
              <DropdownMenuItem permission="create" asChild>
                <Link href={`/b/${businessId}/purchases/debit-notes/new?invoiceId=${invoiceId}`}>
                  <BookOpenText className="size-4" /> Request Refund / Debit Note
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
  );
}
