"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, Building2, Download, MoreHorizontal, Pencil, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { archiveBusinessAction, deleteBusinessAction, renameBusinessAction } from "./actions";

type BusinessCard = {
  id: string;
  name: string;
  country: string;
  currency: string;
  lastOpened: string;
  role: string;
};

function BusinessMenu({ business }: { business: BusinessCard }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(business.name);
  const admin = business.role === "administrator";

  async function rename() {
    const result = await renameBusinessAction(business.id, name);
    if (result.error) return toast.error(result.error);
    setRenameOpen(false);
    toast.success("Business renamed.");
  }

  async function archive() {
    const result = await archiveBusinessAction(business.id);
    if (result.error) return toast.error(result.error);
    toast.success("Business archived.");
  }

  async function remove() {
    const result = await deleteBusinessAction(business.id);
    if (result.error) return toast.error(result.error);
    setDeleteOpen(false);
    toast.success("Business and its local files were deleted.");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${business.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link href={`/b/${business.id}/overview`}><ArrowRight className="size-4" /> Open</Link></DropdownMenuItem>
          <DropdownMenuItem disabled={!admin} onSelect={() => setRenameOpen(true)}><Pencil className="size-4" /> Rename</DropdownMenuItem>
          {admin
            ? <DropdownMenuItem asChild><a href={`/api/businesses/${business.id}/backup`}><Download className="size-4" /> Backup</a></DropdownMenuItem>
            : <DropdownMenuItem disabled title="Administrator access is required"><Download className="size-4" /> Backup</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!admin} onSelect={archive}><Archive className="size-4" /> Archive</DropdownMenuItem>
          <DropdownMenuItem disabled={!admin} className="text-danger focus:text-danger" onSelect={() => setDeleteOpen(true)}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogRoot open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogTitle>Rename business</DialogTitle>
          <DialogDescription>This changes the display name only. Its isolated database identity stays the same.</DialogDescription>
          <div className="mt-5 space-y-1.5"><Label htmlFor={`rename-${business.id}`}>Business name</Label><Input id={`rename-${business.id}`} value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button><Button onClick={rename}>Save name</Button></div>
        </DialogContent>
      </DialogRoot>
      <DialogRoot open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete {business.name}?</DialogTitle>
          <DialogDescription>This permanently removes the business database and attachments from local storage. Export a backup first if you may need it again.</DialogDescription>
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete business</Button></div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

export function BusinessList({ businesses }: { businesses: BusinessCard[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => businesses.filter((business) => business.name.toLowerCase().includes(query.toLowerCase().trim())), [businesses, query]);
  return (
    <>
      <div className="relative mb-4 max-w-md"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search businesses…" aria-label="Search businesses" className="pl-9" /></div>
      {businesses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><Building2 className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No businesses yet</h2><p className="mt-1 text-sm text-muted-foreground">Create your first isolated business workspace.</p><Button asChild className="mt-4"><Link href="/businesses/new">New business</Link></Button></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No businesses match “{query}”</p><Button variant="ghost" className="mt-2" onClick={() => setQuery("")}>Clear search</Button></div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((business, index) => (
            <article key={business.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3.5 transition-colors hover:border-border-strong">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">{index === 0 ? <Star className="size-4 fill-current" /> : <Building2 className="size-4" />}</span>
              <div className="min-w-0 flex-1"><Link href={`/b/${business.id}/overview`} className="font-semibold hover:text-primary hover:underline">{business.name}</Link><p className="mt-1 truncate text-xs text-muted-foreground">{business.country} · {business.currency} · {business.lastOpened}</p></div>
              <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href={`/b/${business.id}/overview`}>Open <ArrowRight className="size-4" /></Link></Button>
              <BusinessMenu business={business} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
