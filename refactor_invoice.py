import re

file_path = "src/modules/sales-invoices/invoice-view-actions.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# I will just rewrite it since I know exactly what it does.
new_content = '''"use client";

import Link from "next/link";
import { BookOpenText, CircleDollarSign, FileMinus2, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteInvoiceAction, duplicateInvoiceAction, voidInvoiceAction } from "./actions";
import type { DocumentStatus } from "./invoice-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function InvoiceViewActions({
  businessId,
  invoiceId,
  invoiceNumber,
  documentStatus,
  balanceMinor,
  journalEntryId,
  inventoryEnabled,
  hasDeliverableItems,
  eInvoiceLocked,
}: {
  businessId: string;
  invoiceId: string;
  invoiceNumber: string;
  documentStatus: DocumentStatus;
  balanceMinor: number;
  journalEntryId: string | null;
  inventoryEnabled: boolean;
  hasDeliverableItems: boolean;
  eInvoiceLocked: boolean;
}) {
  const router = useRouter();
  const canReceive = documentStatus === "posted" && balanceMinor > 0;

  return (
    <DocumentViewActions
      documentNumber={invoiceNumber}
      documentType="Invoice"
      editHref={documentStatus !== "void" && !eInvoiceLocked ? `/b/${businessId}/sales/invoices/${invoiceId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/invoices/${invoiceId}/pdf`}
      emailHref="#"
      onDuplicate={async () => {
        const result = await duplicateInvoiceAction(businessId, invoiceId);
        if (result?.error) throw new Error(result.error);
        router.push(`/b/${businessId}/sales/invoices/${result.data}/edit`);
      }}
      onVoid={documentStatus === "posted" && !eInvoiceLocked ? {
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
        </>
      }
    />
  );
}
'''
with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
