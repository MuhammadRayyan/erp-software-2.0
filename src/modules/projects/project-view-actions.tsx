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
import { FormError } from "@/components/form-error";

export function ProjectViewActions({
  businessId,
  projectId,
  customerId,
  customers = [],
}: {
  businessId: string;
  projectId: string;
  customerId: string | null;
  customers?: Array<{ customerId: string; customerName: string; isPrimary?: boolean; role?: string }>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const query = new URLSearchParams({ projectId });
  if (customerId) query.set("customerId", customerId);
  const defaultInvoiceHref = `/b/${businessId}/sales/invoices/new?${query}`;
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
      <Button permission={"edit"} asChild variant="secondary"><Link href={`/b/${businessId}/projects/${projectId}/edit`}><Pencil className="size-4" /> Edit</Link></Button>
      {customers.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button><Plus className="size-4 mr-1" /> New Invoice</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Select Client to Invoice:</div>
            {customers.map((c) => (
              <DropdownMenuItem permission="create" key={c.customerId} asChild>
                <Link href={`/b/${businessId}/sales/invoices/new?projectId=${projectId}&customerId=${c.customerId}`}>
                  <span className="font-medium">{c.customerName}</span>
                  {c.isPrimary && <span className="ml-1.5 text-xs text-muted-foreground">(Primary)</span>}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button asChild><Link href={defaultInvoiceHref}><Plus className="size-4" /> New Invoice</Link></Button>
      )}
      <Button asChild variant="secondary" className="hidden md:inline-flex"><Link href={poHref}><ShoppingCart className="size-4" /> New Purchase Order</Link></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary"><MoreHorizontal className="size-4" /> More</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild className="md:hidden"><Link href={poHref}>New Purchase Order</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={piHref}>New Purchase Invoice</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem permission="delete" className="text-danger" onSelect={() => setConfirmDelete(true)}>Delete unused project</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div>
    <DialogRoot open={confirmDelete} onOpenChange={setConfirmDelete}><DialogContent><DialogTitle>Delete project?</DialogTitle><DialogDescription>Only a project with no documents, journal lines, notes, or files can be deleted. This action cannot be undone.</DialogDescription>{error && <FormError message={error} />}<div className="mt-5 flex justify-end gap-2"><DialogClose asChild><Button variant="secondary" disabled={pending}>Cancel</Button></DialogClose><Button permission={"delete"} variant="danger" disabled={pending} onClick={remove}>{pending ? "Deleting…" : "Delete Project"}</Button></div></DialogContent></DialogRoot>
  </>;
}
