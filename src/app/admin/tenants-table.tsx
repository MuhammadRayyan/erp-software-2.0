"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle,
  Database,
  Eye,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { toggleTenantSuspensionAction } from "./actions";
import { ConfirmDialog } from "./confirm-dialog";
import type { TenantSummaryRow } from "@/core/admin/tenant-service";

export function TenantsTable({ initialTenants }: { initialTenants: TenantSummaryRow[] }) {
  const [tenants, setTenants] = useState(initialTenants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [confirmTarget, setConfirmTarget] = useState<TenantSummaryRow | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    return {
      all: tenants.length,
      active: tenants.filter((t) => t.status === "active").length,
      suspended: tenants.filter((t) => t.status === "suspended").length,
    };
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
    });
  }, [tenants, search, statusFilter]);

  function handleSuspendClick(tenant: TenantSummaryRow) {
    if (tenant.isSuperAdmin) {
      toast.error("Root Platform Super-Admin account cannot be suspended.");
      return;
    }
    setConfirmTarget(tenant);
  }

  function handleConfirmSuspension() {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setActionPending(true);

    startTransition(async () => {
      try {
        const res = await toggleTenantSuspensionAction(target.id, "suspended");
        if (res.success) {
          setTenants((prev) =>
            prev.map((t) => (t.id === target.id ? { ...t, status: "suspended" } : t))
          );
          toast.success(`Account holder '${target.name}' suspended. Active sessions revoked.`);
          setConfirmTarget(null);
        } else {
          toast.error(res.error || "Failed to suspend account.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error during suspension.");
      } finally {
        setActionPending(false);
      }
    });
  }

  function handleReactivate(tenant: TenantSummaryRow) {
    setActionPending(true);
    startTransition(async () => {
      try {
        const res = await toggleTenantSuspensionAction(tenant.id, "active");
        if (res.success) {
          setTenants((prev) =>
            prev.map((t) => (t.id === tenant.id ? { ...t, status: "active" } : t))
          );
          toast.success(`Account holder '${tenant.name}' reactivated successfully.`);
        } else {
          toast.error(res.error || "Failed to reactivate account.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error reactivating account.");
      } finally {
        setActionPending(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
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
            All Tenants ({counts.all})
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
            placeholder="Search account holders by name or email..."
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

      {/* Tenants Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted-foreground">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Account Holder (Tenant)</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 font-semibold">Businesses Created</th>
                <th className="px-4 py-3.5 font-semibold">Sub-Users Assigned</th>
                <th className="px-4 py-3.5 font-semibold">Storage</th>
                <th className="px-4 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    <p>
                      {search || statusFilter !== "all"
                        ? "No account holders matching the current filter or search query."
                        : "No account holders registered yet."}
                    </p>
                    {(search || statusFilter !== "all") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSearch("");
                          setStatusFilter("all");
                        }}
                        className="mt-3 text-xs"
                      >
                        Clear filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const isSuspended = t.status === "suspended";
                  const businessQuotaReached = !t.isSuperAdmin && t.businessCount >= t.maxBusinesses;
                  const usersQuotaReached = !t.isSuperAdmin && t.subUsersCount >= t.maxUsers;

                  return (
                    <tr
                      key={t.id}
                      className={`transition-colors hover:bg-surface-muted/30 ${
                        isSuspended ? "bg-amber-500/[0.03]" : ""
                      }`}
                    >
                      {/* Name & Email */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{t.name}</span>
                          {t.isSuperAdmin && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
                              <ShieldCheck className="size-3.5" /> Platform Root
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                          <span>{t.email}</span>
                          <span>•</span>
                          <span>Joined {new Date(t.createdAt).toLocaleDateString()}</span>
                        </div>
                      </td>

                      {/* Status */}
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

                      {/* Businesses Quota */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{t.businessCount}</span>
                          <span className="text-muted-foreground">
                            / {t.isSuperAdmin ? "Unlimited" : `${t.maxBusinesses} max`}
                          </span>
                          {businessQuotaReached && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                              Quota Met
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sub-users Quota */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Users className="size-4 text-muted-foreground" />
                          <span className="font-semibold text-foreground">{t.subUsersCount}</span>
                          <span className="text-muted-foreground">
                            / {t.isSuperAdmin ? "Unlimited" : `${t.maxUsers} max`}
                          </span>
                          {usersQuotaReached && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                              Quota Met
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Storage */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                          <Database className="size-4 text-muted-foreground" />
                          <span>{t.storageFormatted}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* View Details drilldown */}
                          <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-xs font-medium">
                            <Link href={`/admin/tenants/${t.id}`}>
                              <Eye className="size-3.5" /> View Details
                            </Link>
                          </Button>

                          {/* Safe Suspend / Reactivate */}
                          {!t.isSuperAdmin && (
                            <>
                              {isSuspended ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleReactivate(t)}
                                  disabled={actionPending}
                                  className="h-8 gap-1 border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                                >
                                  <PlayCircle className="size-3.5 text-emerald-600" /> Reactivate
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleSuspendClick(t)}
                                  disabled={actionPending}
                                  className="h-8 gap-1 border-amber-600/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                                >
                                  <PauseCircle className="size-3.5 text-amber-600" /> Suspend
                                </Button>
                              )}
                            </>
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

      {/* Safety Confirmation Dialog for Accidental Clicks */}
      {confirmTarget && (
        <ConfirmDialog
          open={Boolean(confirmTarget)}
          onOpenChange={(open) => !open && setConfirmTarget(null)}
          title="Confirm Account Holder Suspension"
          description={`Suspending '${confirmTarget.name}' (${confirmTarget.email}) will immediately revoke all active sessions, prevent future sign-ins, and restrict access across their ${confirmTarget.businessCount} workspace(s). Are you sure you want to proceed?`}
          confirmLabel="Suspend Account"
          variant="danger"
          isLoading={actionPending}
          onConfirm={handleConfirmSuspension}
        />
      )}
    </div>
  );
}
