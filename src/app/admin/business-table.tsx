"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  Database,
  PauseCircle,
  PlayCircle,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { toggleBusinessSuspensionAction } from "./actions";
import { ConfirmDialog } from "./confirm-dialog";

export type AdminBusinessRow = {
  id: string;
  name: string;
  country: string;
  currency: string;
  directoryKey: string;
  status: "active" | "suspended" | "trash";
  archived: boolean;
  ownerUserId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
  admins: { name: string; email: string }[];
  storageFormatted: string;
  storageBytes: number;
  memberCount: number;
};

export function BusinessTable({ initialBusinesses }: { initialBusinesses: AdminBusinessRow[] }) {
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [confirmTarget, setConfirmTarget] = useState<AdminBusinessRow | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    return {
      all: businesses.length,
      active: businesses.filter((b) => b.status === "active").length,
      suspended: businesses.filter((b) => b.status === "suspended").length,
    };
  }, [businesses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return businesses.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (!q) return true;
      const matchName = b.name.toLowerCase().includes(q);
      const matchCountry = b.country.toLowerCase().includes(q);
      const matchOwner =
        (b.ownerName && b.ownerName.toLowerCase().includes(q)) ||
        (b.ownerEmail && b.ownerEmail.toLowerCase().includes(q));
      const matchAdmins = b.admins.some(
        (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      );
      return matchName || matchCountry || matchOwner || matchAdmins;
    });
  }, [businesses, search, statusFilter]);

  function handleSuspendClick(b: AdminBusinessRow) {
    setConfirmTarget(b);
  }

  function handleConfirmSuspension() {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setActionPending(true);

    startTransition(async () => {
      try {
        const res = await toggleBusinessSuspensionAction(target.id, "suspended");
        if (res.success && res.newStatus) {
          setBusinesses((prev) =>
            prev.map((b) => (b.id === target.id ? { ...b, status: res.newStatus! } : b))
          );
          toast.success(`Business workspace '${target.name}' suspended successfully.`);
          setConfirmTarget(null);
        } else {
          toast.error(res.error || "Failed to suspend business.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error during suspension.");
      } finally {
        setActionPending(false);
      }
    });
  }

  function handleReactivate(b: AdminBusinessRow) {
    setActionPending(true);
    startTransition(async () => {
      try {
        const res = await toggleBusinessSuspensionAction(b.id, "active");
        if (res.success && res.newStatus) {
          setBusinesses((prev) =>
            prev.map((item) => (item.id === b.id ? { ...item, status: res.newStatus! } : item))
          );
          toast.success(`Business workspace '${b.name}' reactivated successfully.`);
        } else {
          toast.error(res.error || "Failed to reactivate business.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error reactivating business.");
      } finally {
        setActionPending(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Controls & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised p-1 text-sm">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Workspaces ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors ${
              statusFilter === "active"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCircle className="size-4" /> Active ({counts.active})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("suspended")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors ${
              statusFilter === "suspended"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PauseCircle className="size-4" /> Suspended ({counts.suspended})
          </button>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspaces or account holders..."
            className="pl-9 pr-8 h-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Businesses Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted-foreground">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Workspace</th>
                <th className="px-4 py-3.5 font-semibold">Account Holder (Owner)</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 font-semibold">Members</th>
                <th className="px-4 py-3.5 font-semibold">Storage</th>
                <th className="px-4 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No businesses matching the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const isSuspended = b.status === "suspended";

                  return (
                    <tr
                      key={b.id}
                      className={`transition-colors hover:bg-surface-muted/30 ${
                        isSuspended ? "bg-amber-500/[0.03]" : ""
                      }`}
                    >
                      {/* Name & Metadata */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">{b.name}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{b.country}</span>
                          <span>•</span>
                          <span className="font-mono">{b.currency}</span>
                          <span>•</span>
                          <span>Created {new Date(b.createdAt).toLocaleDateString()}</span>
                        </div>
                      </td>

                      {/* Owner / Account Holder */}
                      <td className="px-4 py-3.5">
                        {b.ownerName ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <UserRound className="size-3.5 text-muted-foreground" />
                              {b.ownerUserId ? (
                                <Link
                                  href={`/admin/tenants/${b.ownerUserId}`}
                                  className="hover:underline text-primary"
                                >
                                  {b.ownerName}
                                </Link>
                              ) : (
                                <span>{b.ownerName}</span>
                              )}
                            </div>
                            {b.ownerEmail && (
                              <div className="text-xs text-muted-foreground font-mono">
                                {b.ownerEmail}
                              </div>
                            )}
                          </div>
                        ) : b.admins.length > 0 ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-foreground">{b.admins[0].name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {b.admins[0].email}
                            </div>
                          </div>
                        ) : (
                          <span className="italic text-muted-foreground">Unassigned</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5">
                        {isSuspended ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
                            <AlertTriangle className="size-3.5" /> Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300">
                            <CheckCircle className="size-3.5" /> Active
                          </span>
                        )}
                      </td>

                      {/* Members */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <Users className="size-4 text-muted-foreground" />
                          <span>{b.memberCount}</span>
                        </div>
                      </td>

                      {/* Storage */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                          <Database className="size-4 text-muted-foreground" />
                          <span>{b.storageFormatted}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Live View Button */}
                          <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-xs font-medium">
                            <Link href={`/b/${b.id}/overview`}>
                              Live View <ArrowUpRight className="size-4" />
                            </Link>
                          </Button>

                          {/* Safe Suspend / Reactivate Action */}
                          {isSuspended ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleReactivate(b)}
                              disabled={actionPending}
                              className="h-8 gap-1.5 border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                            >
                              <PlayCircle className="size-3.5 text-emerald-600" /> Reactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleSuspendClick(b)}
                              disabled={actionPending}
                              className="h-8 gap-1.5 border-amber-600/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                            >
                              <PauseCircle className="size-3.5 text-amber-600" /> Suspend
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Confirmation Dialog */}
      {confirmTarget && (
        <ConfirmDialog
          open={Boolean(confirmTarget)}
          onOpenChange={(open) => !open && setConfirmTarget(null)}
          title="Confirm Business Suspension"
          description={`Suspending workspace '${confirmTarget.name}' will prevent all standard tenant members from accessing its books and accounting transactions. Super-Admins retain Live View access. Are you sure you want to suspend this workspace?`}
          confirmLabel="Suspend Workspace"
          variant="danger"
          isLoading={actionPending}
          onConfirm={handleConfirmSuspension}
        />
      )}
    </div>
  );
}
