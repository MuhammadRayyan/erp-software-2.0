"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteProjectAction } from "./actions";

export function ProjectViewActions({ businessId, projectId, customerId }: { businessId: string; projectId: string; customerId: string | null }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const query = new URLSearchParams({ projectId });
  if (customerId) query.set("customerId", customerId);
  const invoiceHref = `/b/${businessId}/sales/invoices/new?${query}`;
  const poHref = `/b/${businessId}/purchases/orders/new?projectId=${encodeURIComponent(projectId)}`;
  const piHref = `/b/${businessId}/purchases/invoices/new?projectId=${encodeURIComponent(projectId)}`;
  async function remove() {
    setPending(true); setError("");
    const result = await deleteProjectAction(businessId, projectId);
    setPending(false);
    if (result.error) return setError(result.error);
    toast.success("Project deleted.");
    router.push(`/b/${businessId}/projects`);
  }
  return <>
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild variant="secondary"><Link href={`/b/${businessId}/projects/${projectId}/edit`}><Pencil className="size-4" /> Edit</Link></Button>
      <Button asChild><Link href={invoiceHref}><Plus className="size-4" /> New Invoice</Link></Button>
      <Button asChild variant="secondary" className="hidden md:inline-flex"><Link href={poHref}><ShoppingCart className="size-4" /> New Purchase Order</Link></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary"><MoreHorizontal className="size-4" /> More</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild className="md:hidden"><Link href={poHref}>New Purchase Order</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={piHref}>New Purchase Invoice</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-danger" onSelect={() => setConfirmDelete(true)}>Delete unused project</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div>
    <DialogRoot open={confirmDelete} onOpenChange={setConfirmDelete}><DialogContent><DialogTitle>Delete project?</DialogTitle><DialogDescription>Only a project with no documents, journal lines, notes, or files can be deleted. This action cannot be undone.</DialogDescription>{error && <div role="alert" className="mt-3 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}<div className="mt-5 flex justify-end gap-2"><DialogClose asChild><Button variant="secondary" disabled={pending}>Cancel</Button></DialogClose><Button variant="danger" disabled={pending} onClick={remove}>{pending ? "Deleting…" : "Delete Project"}</Button></div></DialogContent></DialogRoot>
  </>;
}
