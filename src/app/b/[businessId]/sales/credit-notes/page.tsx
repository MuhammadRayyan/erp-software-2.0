import Link from "next/link";
import { FileMinus2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { CreditNoteTable } from "@/modules/sales-credit-notes/credit-note-table";
import { listCreditNotes } from "@/modules/sales-credit-notes/credit-note-service";

export const metadata = { title: "Sales Credit Notes" };
export default async function CreditNotesPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; const { user } = await requireModule(businessId, "sales"); const notes = listCreditNotes(businessId, user.id); return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Sales Credit Notes</h1><p className="page-description">Customer credits applied to posted Sales Invoices.</p></div><Button asChild><Link href={`/b/${businessId}/sales/credit-notes/new`}><Plus className="size-4" /> New Credit Note</Link></Button></div>{notes.length ? <CreditNoteTable businessId={businessId} creditNotes={notes} /> : <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><FileMinus2 className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No sales credit notes yet</h2><p className="mt-1 text-sm text-muted-foreground">Create one from a posted invoice when a customer needs a credit.</p></div>}</div>; }
