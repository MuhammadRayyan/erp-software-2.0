"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Banknote,
  Building2,
  Download,
  MoreHorizontal,
  Pencil,
  ReceiptText,
  Search,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
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
import {
  archiveBusinessAction,
  deleteBusinessAction,
  renameBusinessAction,
  togglePinBusinessAction,
} from "./actions";

export type BusinessCard = {
  id: string;
  name: string;
  country: string;
  currency: string;
  lastOpened: string;
  role: string;
  isPinned?: boolean;
  kpis?: {
    liquidBalance: string;
    outstandingReceivables: string;
    hasOutstanding: boolean;
    overdueCount: number;
    overdueTotal: string;
    activeEmployees: number;
  };
};

function BusinessMenu({ business }: { business: BusinessCard }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
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
    setArchiveOpen(false);
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
          <DropdownMenuItem asChild>
            <Link href={`/b/${business.id}/sales/invoices`}>
              <ReceiptText className="size-4" /> Invoices
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/b/${business.id}/banking/accounts`}>
              <Banknote className="size-4" /> Banking
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!admin} onSelect={() => setRenameOpen(true)}><Pencil className="size-4" /> Rename</DropdownMenuItem>
          {admin
            ? <DropdownMenuItem asChild><a href={`/api/businesses/${business.id}/backup`}><Download className="size-4" /> Backup</a></DropdownMenuItem>
            : <DropdownMenuItem disabled title="Administrator access is required"><Download className="size-4" /> Backup</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!admin} onSelect={() => setArchiveOpen(true)}><Archive className="size-4" /> Archive</DropdownMenuItem>
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
      <DialogRoot open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogTitle>Archive {business.name}?</DialogTitle>
          <DialogDescription>Archiving hides the business from your list. Its data is kept, but there is no one-click unarchive — restore a backup copy if you need it back.</DialogDescription>
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setArchiveOpen(false)}>Cancel</Button><Button onClick={archive}><Archive className="size-4" /> Archive business</Button></div>
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
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(
    () => new Set(businesses.filter((b) => b.isPinned).map((b) => b.id)),
  );

  useEffect(() => {
    setPinnedIds(new Set(businesses.filter((b) => b.isPinned).map((b) => b.id)));
  }, [businesses]);

  async function togglePin(businessId: string, event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const willPin = !pinnedIds.has(businessId);
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (willPin) next.add(businessId);
      else next.delete(businessId);
      return next;
    });

    const res = await togglePinBusinessAction(businessId, willPin);
    if (res.error) {
      toast.error(res.error);
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (willPin) next.delete(businessId);
        else next.add(businessId);
        return next;
      });
    } else {
      toast.success(willPin ? "Business pinned to top" : "Business unpinned");
    }
  }

  const sorted = useMemo(() => {
    return [...businesses].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedIds.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return 0;
    });
  }, [businesses, pinnedIds]);

  const filtered = useMemo(
    () => sorted.filter((business) => business.name.toLowerCase().includes(query.toLowerCase().trim())),
    [sorted, query],
  );

  return (
    <>
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search businesses…"
          aria-label="Search businesses"
          className="pl-9"
        />
      </div>
      {businesses.length === 0 ? (
        <EmptyState
          icon={<Building2 className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No businesses yet"
          description="Create your first isolated business workspace."
          action={<Button asChild><Link href="/businesses/new">New business</Link></Button>}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-10 text-center">
          <p className="font-medium">No businesses match “{query}”</p>
          <Button variant="ghost" className="mt-2" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filtered.map((business) => {
            const isPinned = pinnedIds.has(business.id);
            const kpis = business.kpis;
            return (
              <article
                key={business.id}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-lg border border-border bg-surface-raised p-4 transition-all hover:border-border-strong hover:bg-surface-muted/30 hover:shadow-xs"
              >
                <Link
                  href={`/b/${business.id}/overview`}
                  className="absolute inset-0 z-[1] rounded-lg"
                  tabIndex={-1}
                  aria-label={`Open ${business.name}`}
                />

                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => togglePin(business.id, e)}
                    aria-label={isPinned ? `Unpin ${business.name}` : `Pin ${business.name} to top`}
                    title={isPinned ? "Pinned to top (click to unpin)" : "Pin to top"}
                    className="relative z-[2] grid size-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-surface text-muted-foreground transition-colors hover:border-amber-400/50 hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-950/30 cursor-pointer"
                  >
                    <Star
                      className={`size-4 transition-transform ${
                        isPinned
                          ? "fill-amber-400 text-amber-500 scale-110"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-base tracking-tight group-hover:underline">
                        {business.name}
                      </span>
                      {isPinned && (
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          Pinned
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {business.country} · {business.currency} · {business.lastOpened}
                    </p>

                    {/* Multi-Entity KPI Badges */}
                    {kpis && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span
                          title="Liquid Cash & Bank balance"
                          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
                        >
                          <Banknote className="size-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Bank: {kpis.liquidBalance}</span>
                        </span>

                        <span
                          title="Open sales invoices receivable"
                          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
                        >
                          <ReceiptText className="size-3 text-primary" />
                          <span>Receivables: {kpis.outstandingReceivables}</span>
                        </span>

                        {kpis.overdueCount > 0 && (
                          <span
                            title={`${kpis.overdueCount} overdue invoices total ${kpis.overdueTotal}`}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400"
                          >
                            <AlertTriangle className="size-3 text-rose-600 dark:text-rose-400" />
                            <span>{kpis.overdueCount} Overdue ({kpis.overdueTotal})</span>
                          </span>
                        )}

                        <span
                          title="Active registered employees"
                          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          <Users className="size-3 text-muted-foreground" />
                          <span>{kpis.activeEmployees} {kpis.activeEmployees === 1 ? "Employee" : "Employees"}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct quick-jump actions & menu */}
                <div className="relative z-[2] flex items-center gap-1.5 shrink-0 self-end sm:self-center border-t border-border/40 pt-2 sm:border-0 sm:pt-0">
                  <div className="hidden sm:flex items-center gap-1 mr-1">
                    <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                      <Link href={`/b/${business.id}/sales/invoices`}>Invoices</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                      <Link href={`/b/${business.id}/banking/accounts`}>Banking</Link>
                    </Button>
                  </div>

                  <Button asChild variant="secondary" size="sm" className="h-8 gap-1.5 font-medium shadow-2xs">
                    <Link href={`/b/${business.id}/overview`}>
                      Open <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>

                  <BusinessMenu business={business} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
