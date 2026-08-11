"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, BookOpenText, CircleDollarSign, Copy, Download, FileMinus2, Mail, MoreHorizontal, PackageCheck, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteInvoiceAction, duplicateInvoiceAction, voidInvoiceAction } from "./actions";
import type { DocumentStatus } from "./invoice-service";

type ConfirmAction = "delete" | "void" | null;

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
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function duplicate() {
    setPending(true);
    setError("");
    const result = await duplicateInvoiceAction(businessId, invoiceId);
    if (result?.error) {
      setPending(false);
      toast.error(result.error);
    }
  }
  async function confirm() {
    setPending(true);
    setError("");
    const result = confirmAction === "delete"
      ? await deleteInvoiceAction(businessId, invoiceId)
      : await voidInvoiceAction(businessId, invoiceId);
    setPending(false);
    if (result.error) return setError(result.error);
    setConfirmAction(null);
    if (confirmAction === "delete") {
      toast.success("Draft invoice deleted.");
      router.push(`/b/${businessId}/sales/invoices`);
    } else {
      toast.success("Invoice voided with a reversing journal entry.");
      router.refresh();
    }
  }
  const canReceive = documentStatus === "posted" && balanceMinor > 0;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {documentStatus !== "void" && !eInvoiceLocked && <Button asChild><Link href={`/b/${businessId}/sales/invoices/${invoiceId}/edit`}><Pencil className="size-4" /> Edit</Link></Button>}
        {inventoryEnabled && hasDeliverableItems && documentStatus === "posted" && <Button asChild variant="secondary"><Link href={`/b/${businessId}/sales/delivery-notes/new?invoiceId=${invoiceId}`}><PackageCheck className="size-4" /> Create Delivery Note</Link></Button>}
        {canReceive && <Button asChild variant="secondary"><Link href={`/b/${businessId}/sales/receipts/new?invoiceId=${invoiceId}`}><CircleDollarSign className="size-4" /> Record Receipt</Link></Button>}
        <Button variant="secondary" className="hidden md:inline-flex" title="Email delivery is planned for a later phase" disabled><Mail className="size-4" /> Email (later)</Button>
        <Button asChild variant="secondary" className="hidden md:inline-flex"><a href={`/api/businesses/${businessId}/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer"><Download className="size-4" /> Print / PDF</a></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="secondary">More <MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="md:hidden" title="Email delivery is planned for a later phase" disabled><Mail className="size-4" /> Email (later)</DropdownMenuItem>
            <DropdownMenuItem asChild className="md:hidden"><a href={`/api/businesses/${businessId}/invoices/${invoiceId}/pdf`} target="_blank"><Download className="size-4" /> Print / PDF</a></DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onSelect={() => void duplicate()}><Copy className="size-4" /> Duplicate</DropdownMenuItem>
            {canReceive && <DropdownMenuItem asChild><Link href={`/b/${businessId}/sales/credit-notes/new?invoiceId=${invoiceId}`}><FileMinus2 className="size-4" /> Create Credit Note</Link></DropdownMenuItem>}
            {journalEntryId && <DropdownMenuItem asChild><Link href={`/b/${businessId}/accounting/journal/${journalEntryId}`}><BookOpenText className="size-4" /> View Journal Entry</Link></DropdownMenuItem>}
            {(documentStatus === "posted" || documentStatus === "draft") && <DropdownMenuSeparator />}
            {documentStatus === "posted" && !eInvoiceLocked && <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => { setError(""); setConfirmAction("void"); }}><Ban className="size-4" /> Void</DropdownMenuItem>}
            {documentStatus === "draft" && <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => { setError(""); setConfirmAction("delete"); }}><Trash2 className="size-4" /> Delete draft</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DialogRoot open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogTitle>{confirmAction === "delete" ? `Delete ${invoiceNumber}?` : `Void ${invoiceNumber}?`}</DialogTitle>
          <DialogDescription>{confirmAction === "delete" ? "This permanently removes the draft. Drafts have no ledger impact." : "This retains the invoice and creates a balanced reversing journal entry. An invoice with receipt allocations cannot be voided."}</DialogDescription>
          {error && <div role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={confirm}>{confirmAction === "delete" ? "Delete draft" : "Void invoice"}</Button></div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
