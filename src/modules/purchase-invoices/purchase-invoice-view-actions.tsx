"use client";

import Link from "next/link";
import { BookOpenText, CircleDollarSign, ArrowDownToLine, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deletePurchaseInvoiceAction, duplicatePurchaseInvoiceAction, voidPurchaseInvoiceAction } from "./actions";
import type { PurchaseInvoiceStatus } from "./purchase-invoice-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function PurchaseInvoiceViewActions({
  businessId, invoiceId, internalNumber, documentStatus, balanceMinor, totalMinor, journalEntryId, inventoryEnabled, hasInventoryLines, hasGoodsReceipts = false
}: {
  businessId: string; invoiceId: string; internalNumber: string; documentStatus: PurchaseInvoiceStatus; balanceMinor: number; totalMinor?: number; journalEntryId: string | null; inventoryEnabled: boolean; hasInventoryLines: boolean; hasGoodsReceipts?: boolean;
}) {
  const router = useRouter();

  const canEdit = documentStatus !== "void" && !hasGoodsReceipts && (documentStatus === "draft" || totalMinor === undefined || balanceMinor === totalMinor);
  const canVoid = documentStatus === "posted" && (totalMinor === undefined || balanceMinor === totalMinor);

  return (
    <DocumentViewActions
      documentNumber={internalNumber}
      documentType="Bill"
      editHref={canEdit ? `/b/${businessId}/purchases/invoices/${invoiceId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/documents/purchase-invoice/${invoiceId}/pdf`}
      copyToActions={documentStatus !== "void" ? [
        ...(documentStatus === "posted" && balanceMinor > 0 ? [
          {
            label: "Supplier Payment",
            href: `/b/${businessId}/purchases/payments/new?invoiceId=${invoiceId}`,
            icon: CircleDollarSign,
          },
        ] : []),
        ...(inventoryEnabled && hasInventoryLines ? [
          {
            label: "Goods Receipt",
            href: `/b/${businessId}/purchases/goods-receipts/new?invoiceId=${invoiceId}`,
            icon: ArrowDownToLine,
          },
        ] : []),
        ...(documentStatus === "posted" ? [
          {
            label: "Debit Note",
            href: `/b/${businessId}/purchases/debit-notes/new?invoiceId=${invoiceId}`,
            icon: BookOpenText,
          },
        ] : []),
      ] : undefined}
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
        <>
          {inventoryEnabled && hasInventoryLines && documentStatus !== "void" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/goods-receipts/new?invoiceId=${invoiceId}`}><PackagePlus className="size-4" /> Receive Goods</Link>
            </Button>
          )}
          {documentStatus === "posted" && balanceMinor > 0 && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/payments/new?invoiceId=${invoiceId}`}><CircleDollarSign className="size-4" /> Record Payment</Link>
            </Button>
          )}
        </>
      }
      extraActions={
        <>
          {documentStatus !== "void" && documentStatus !== "draft" && (
            <DropdownMenuItem asChild>
              <Link href={`/b/${businessId}/purchases/debit-notes/new?invoiceId=${invoiceId}`}>
                <BookOpenText className="size-4" /> Request Refund / Debit Note
              </Link>
            </DropdownMenuItem>
          )}
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
