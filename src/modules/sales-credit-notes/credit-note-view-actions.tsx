"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, BookOpenText, Copy, Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteCreditNoteAction, duplicateCreditNoteAction, voidCreditNoteAction } from "./actions";
import type { CreditNoteStatus } from "./credit-note-service";
import { FormError } from "@/components/form-error";

type Confirm = "delete" | "void" | null;

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
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function duplicate() {
    setPending(true);
    const result = await duplicateCreditNoteAction(businessId, noteId);
    if (result?.error) { setPending(false); toast.error(result.error); }
  }
  async function run() {
    setPending(true); setError("");
    const result = confirm === "delete"
      ? await deleteCreditNoteAction(businessId, noteId)
      : await voidCreditNoteAction(businessId, noteId);
    setPending(false);
    if (result.error) return setError(result.error);
    setConfirm(null);
    if (confirm === "delete") router.push(`/b/${businessId}/sales/credit-notes`);
    else router.refresh();
    toast.success(confirm === "delete" ? "Draft credit note deleted." : "Credit note voided with a reversing journal.");
  }
  return <>
    <div className="flex flex-wrap gap-2">
      {documentStatus !== "void" && !eInvoiceLocked && <Button asChild><Link href={`/b/${businessId}/sales/credit-notes/${noteId}/edit`}><Pencil className="size-4" /> Edit</Link></Button>}
      <Button asChild variant="secondary"><a href={`/api/businesses/${businessId}/documents/sales-credit-note/${noteId}/pdf`} target="_blank" rel="noreferrer"><Download className="size-4" /> Print / PDF</a></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" aria-label="More actions">More <MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem disabled={pending} onSelect={() => void duplicate()}><Copy className="size-4" /> Duplicate</DropdownMenuItem>
        {journalEntryId && <DropdownMenuItem asChild><Link href={`/b/${businessId}/accounting/journal/${journalEntryId}`}><BookOpenText className="size-4" /> View Journal Entry</Link></DropdownMenuItem>}
        {documentStatus !== "void" && !eInvoiceLocked && <DropdownMenuSeparator />}
        {documentStatus === "posted" && !eInvoiceLocked && <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setConfirm("void")}><Ban className="size-4" /> Void</DropdownMenuItem>}
        {documentStatus === "draft" && <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setConfirm("delete")}><Trash2 className="size-4" /> Delete draft</DropdownMenuItem>}
      </DropdownMenuContent></DropdownMenu>
    </div>
    <DialogRoot open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}><DialogContent>
      <DialogTitle>{confirm === "delete" ? `Delete ${creditNoteNumber}?` : `Void ${creditNoteNumber}?`}</DialogTitle>
      <DialogDescription>{confirm === "delete" ? "This permanently removes the non-posting draft." : "This retains the credit note, reverses its journal, and restores the invoice balance."}</DialogDescription>
      {error && <FormError message={error} />}
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={run}>{confirm === "delete" ? "Delete draft" : "Void credit note"}</Button></div>
    </DialogContent></DialogRoot>
  </>;
}
