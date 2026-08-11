"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, BookOpenText, MoreHorizontal, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { voidBankTransactionAction, voidBankTransferAction } from "./actions";

export function BankingDocumentActions({ businessId, kind, id, number, status, journalId }: { businessId: string; kind: "transaction" | "transfer"; id: string; number: string; status: "draft" | "posted" | "void"; journalId?: string | null }) {
  const [confirm, setConfirm] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  async function run() { setPending(true); setError(""); const result = kind === "transaction" ? await voidBankTransactionAction(businessId, id) : await voidBankTransferAction(businessId, id); setPending(false); if (result.error) return setError(result.error); setConfirm(false); router.refresh(); toast.success(kind === "transaction" ? "Bank Transaction voided." : "Bank Transfer voided."); }
  return <><div className="flex flex-wrap gap-2">{kind === "transaction" && status === "draft" && <Button asChild><Link href={`/b/${businessId}/banking/transactions/${id}/edit`}><Pencil className="size-4" /> Edit Draft</Link></Button>}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary">More <MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{journalId && <DropdownMenuItem asChild><Link href={`/b/${businessId}/accounting/journal/${journalId}`}><BookOpenText className="size-4" /> View Journal Entry</Link></DropdownMenuItem>}{status === "posted" && <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setConfirm(true)}><Ban className="size-4" /> Void</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div><DialogRoot open={confirm} onOpenChange={setConfirm}><DialogContent><DialogTitle>Void {number}?</DialogTitle><DialogDescription>The ledger impact will be reversed. A completed reconciliation blocks this action.</DialogDescription>{error && <div role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}<div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={run}>Void document</Button></div></DialogContent></DialogRoot></>;
}
