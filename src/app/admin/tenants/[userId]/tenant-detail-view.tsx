"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle,
  Copy,
  KeyRound,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Save,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  resetTenantPasswordAction,
  toggleBusinessSuspensionAction,
  toggleTenantSuspensionAction,
  updateTenantQuotasAction,
} from "../../actions";
import { ConfirmDialog } from "../../confirm-dialog";
import { copyToClipboard } from "../../clipboard";
import type { TenantDetails } from "@/core/admin/tenant-service";

function generateSecurePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";
  let pwd = "";
  for (let i = 0; i < 16; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export function TenantDetailView({ initialDetails }: { initialDetails: TenantDetails }) {
  const [details, setDetails] = useState(initialDetails);
  const [maxBusinesses, setMaxBusinesses] = useState(String(initialDetails.user.maxBusinesses));
  const [maxUsers, setMaxUsers] = useState(String(initialDetails.user.maxUsers));
  const [isPending, startTransition] = useTransition();

  // Suspension confirmation state
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);

  // Password reset modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [copied, setCopied] = useState(false);

  // Business suspend confirmation state
  const [businessConfirmTarget, setBusinessConfirmTarget] = useState<TenantDetails["businesses"][0] | null>(null);

  const isSuspended = details.user.status === "suspended";
  const distinctSubUsersCount = new Set(details.subUsers.map((su) => su.userId)).size;

  function handleSaveQuotas(e: React.FormEvent) {
    e.preventDefault();
    const bQuota = parseInt(maxBusinesses, 10);
    const uQuota = parseInt(maxUsers, 10);

    if (isNaN(bQuota) || bQuota < 1) return toast.error("Max businesses must be at least 1.");
    if (isNaN(uQuota) || uQuota < 1) return toast.error("Max sub-users must be at least 1.");

    startTransition(async () => {
      const res = await updateTenantQuotasAction(details.user.id, {
        maxBusinesses: bQuota,
        maxUsers: uQuota,
      });

      if (res.success) {
        setDetails((prev) => ({
          ...prev,
          user: {
            ...prev.user,
            maxBusinesses: bQuota,
            maxUsers: uQuota,
          },
        }));
        toast.success("Account allocation limits updated successfully.");
      } else {
        toast.error(res.error || "Failed to update quotas.");
      }
    });
  }

  function handleConfirmSuspend() {
    startTransition(async () => {
      const res = await toggleTenantSuspensionAction(details.user.id, "suspended");
      if (res.success) {
        setDetails((prev) => ({
          ...prev,
          user: { ...prev.user, status: "suspended" },
        }));
        setSuspendModalOpen(false);
        toast.success("Tenant suspended. All active sessions have been revoked.");
      } else {
        toast.error(res.error || "Failed to suspend account.");
      }
    });
  }

  function handleReactivate() {
    startTransition(async () => {
      const res = await toggleTenantSuspensionAction(details.user.id, "active");
      if (res.success) {
        setDetails((prev) => ({
          ...prev,
          user: { ...prev.user, status: "active" },
        }));
        toast.success("Tenant reactivated successfully.");
      } else {
        toast.error(res.error || "Failed to reactivate account.");
      }
    });
  }

  function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      return toast.error("Password must be at least 8 characters long.");
    }

    startTransition(async () => {
      const res = await resetTenantPasswordAction(details.user.id, newPassword);
      if (res.success) {
        toast.success("Password reset successfully. Active sessions revoked.");
        setResetModalOpen(false);
        setNewPassword("");
      } else {
        toast.error(res.error || "Failed to reset password.");
      }
    });
  }

  function handleConfirmBusinessSuspension() {
    if (!businessConfirmTarget) return;
    const target = businessConfirmTarget;

    startTransition(async () => {
      const res = await toggleBusinessSuspensionAction(target.id, "suspended");
      if (res.success && res.newStatus) {
        setDetails((prev) => ({
          ...prev,
          businesses: prev.businesses.map((b) =>
            b.id === target.id ? { ...b, status: res.newStatus! } : b
          ),
        }));
        toast.success(`Business '${target.name}' suspended successfully.`);
        setBusinessConfirmTarget(null);
      } else {
        toast.error(res.error || "Failed to suspend business.");
      }
    });
  }

  function handleReactivateBusiness(b: TenantDetails["businesses"][0]) {
    startTransition(async () => {
      const res = await toggleBusinessSuspensionAction(b.id, "active");
      if (res.success && res.newStatus) {
        setDetails((prev) => ({
          ...prev,
          businesses: prev.businesses.map((item) =>
            item.id === b.id ? { ...item, status: res.newStatus! } : item
          ),
        }));
        toast.success(`Business '${b.name}' reactivated successfully.`);
      } else {
        toast.error(res.error || "Failed to reactivate business.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">
          Admin Control Panel
        </Link>
        <span>/</span>
        <Link href="/admin?tab=tenants" className="hover:text-foreground">
          Account Holders
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{details.user.name}</span>
      </div>

      {/* Account Holder Profile Header Card */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {details.user.name}
              </h1>
              {details.user.isSuperAdmin ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
                  <ShieldCheck className="size-3.5" /> Platform Root Super-Admin
                </span>
              ) : isSuspended ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
                  <AlertTriangle className="size-3.5" /> Account Suspended
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300">
                  <CheckCircle className="size-3.5" /> Active Account
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="font-mono">{details.user.email}</span>
              <span>•</span>
              <span>Enrolled {new Date(details.user.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>{details.businesses.length} Workspaces</span>
              <span>•</span>
              <span>{distinctSubUsersCount} Sub-User{distinctSubUsersCount === 1 ? "" : "s"} ({details.subUsers.length} assignment{details.subUsers.length === 1 ? "" : "s"})</span>
            </div>
          </div>
        </div>

        {/* Global Account Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="gap-2 text-sm"
            onClick={() => setResetModalOpen(true)}
          >
            <KeyRound className="size-4" /> Reset Password
          </Button>

          {!details.user.isSuperAdmin && (
            <>
              {isSuspended ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2 border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 text-sm"
                  disabled={isPending}
                  onClick={handleReactivate}
                >
                  <PlayCircle className="size-4 text-emerald-600" /> Reactivate Account
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2 border-amber-600/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 text-sm"
                  disabled={isPending}
                  onClick={() => setSuspendModalOpen(true)}
                >
                  <PauseCircle className="size-4 text-amber-600" /> Suspend Account
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quotas & Resource Allocation Editor */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Allocation Quotas & Capacity Limits
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Set how many business workspaces and team members this account holder is authorized to create.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            Enforced on workspace creation and user invitation
          </span>
        </div>

        <form onSubmit={handleSaveQuotas} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Max Businesses */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="quota-businesses">Max Business Workspaces</Label>
              <span className="text-xs text-muted-foreground">
                Currently: <strong>{details.businesses.length}</strong> created
              </span>
            </div>
            <Input
              id="quota-businesses"
              type="number"
              min="1"
              max="1000"
              value={maxBusinesses}
              onChange={(e) => setMaxBusinesses(e.target.value)}
              className="text-sm font-mono"
            />
          </div>

          {/* Max Sub-Users */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="quota-users">Max Sub-Users Across Businesses</Label>
              <span className="text-xs text-muted-foreground">
                Currently: <strong>{distinctSubUsersCount}</strong> assigned (limit: {details.user.maxUsers})
              </span>
            </div>
            <Input
              id="quota-users"
              type="number"
              min="1"
              max="10000"
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
              className="text-sm font-mono"
            />
          </div>

          <div className="flex items-end">
            <Button type="submit" size="sm" variant="primary" disabled={isPending} className="gap-2 text-sm">
              {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Allocation Limits
            </Button>
          </div>
        </form>
      </div>

      {/* Businesses Owned By This Account Holder */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Workspaces Created By This Account ({details.businesses.length})
          </h2>
          <span className="text-sm text-muted-foreground">
            Isolated databases with independent accounting ledgers
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Workspace Name</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Country / Currency</th>
                  <th className="px-4 py-3 font-semibold">Members</th>
                  <th className="px-4 py-3 font-semibold">Storage</th>
                  <th className="px-4 py-3 text-right font-semibold">Live Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {details.businesses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      This account holder has not created any businesses yet.
                    </td>
                  </tr>
                ) : (
                  details.businesses.map((b) => {
                    const isBusinessSuspended = b.status === "suspended";
                    return (
                      <tr key={b.id} className="transition-colors hover:bg-surface-muted/30">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground">{b.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Created {new Date(b.createdAt).toLocaleDateString()}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {isBusinessSuspended ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              Active
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {b.country} · {b.currency}
                        </td>

                        <td className="px-4 py-3 text-foreground">{b.memberCount}</td>

                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {b.storageFormatted}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-sm">
                              <Link href={`/b/${b.id}/overview`}>
                                Live View <ArrowUpRight className="size-4" />
                              </Link>
                            </Button>

                            {isBusinessSuspended ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 text-sm border-emerald-600/40 text-emerald-700"
                                onClick={() => handleReactivateBusiness(b)}
                              >
                                Reactivate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 text-sm border-amber-600/40 text-amber-700"
                                onClick={() => setBusinessConfirmTarget(b)}
                              >
                                Suspend
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
      </section>

      {/* Sub-Users & Permissions Across Businesses */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Sub-Users & Team Permissions ({distinctSubUsersCount} distinct user{distinctSubUsersCount === 1 ? "" : "s"}, {details.subUsers.length} assignment{details.subUsers.length === 1 ? "" : "s"})
          </h2>
          <span className="text-sm text-muted-foreground">
            Users invited to access businesses under this account
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Workspace</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Module Access</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {details.subUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No sub-users have been added under this account holder yet.
                    </td>
                  </tr>
                ) : (
                  details.subUsers.map((su, idx) => (
                    <tr key={idx} className="transition-colors hover:bg-surface-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{su.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{su.email}</div>
                      </td>

                      <td className="px-4 py-3 font-medium text-foreground">{su.businessName}</td>

                      <td className="px-4 py-3">
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground uppercase tracking-wide">
                          {su.role}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {su.modules.map((m) => (
                            <span
                              key={m}
                              className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-muted-foreground capitalize"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {su.status === "suspended" ? (
                          <span className="text-xs font-medium text-amber-600">Suspended</span>
                        ) : (
                          <span className="text-xs font-medium text-emerald-600">Active</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Confirmation Dialog for Tenant Suspension */}
      <ConfirmDialog
        open={suspendModalOpen}
        onOpenChange={setSuspendModalOpen}
        title="Suspend Account Holder"
        description={`Suspending '${details.user.name}' will immediately revoke all their active sessions, block future sign-ins, and prevent access across their ${details.businesses.length} workspace(s). Are you sure?`}
        confirmLabel="Suspend Account"
        variant="danger"
        isLoading={isPending}
        onConfirm={handleConfirmSuspend}
      />

      {/* Confirmation Dialog for Business Workspace Suspension */}
      {businessConfirmTarget && (
        <ConfirmDialog
          open={Boolean(businessConfirmTarget)}
          onOpenChange={(open) => !open && setBusinessConfirmTarget(null)}
          title="Suspend Business Workspace"
          description={`Suspending workspace '${businessConfirmTarget.name}' will restrict tenant users from accessing this workspace. Are you sure you want to suspend it?`}
          confirmLabel="Suspend Workspace"
          variant="danger"
          isLoading={isPending}
          onConfirm={handleConfirmBusinessSuspension}
        />
      )}

      {/* Reset Password Modal */}
      <DialogRoot open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="max-w-md">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600">
              <KeyRound className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Reset Tenant Password
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Assign a new password for {details.user.name} ({details.user.email}). All active sessions will be terminated immediately.
              </DialogDescription>
            </div>
          </div>

          <form onSubmit={handleResetPasswordSubmit} className="mt-5 space-y-4 text-sm">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="reset-new-password">New Temporary Password</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateSecurePassword())}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Sparkles className="size-3.5" /> Auto-Generate
                  </button>
                  {newPassword && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyToClipboard(newPassword);
                        if (ok) {
                          setCopied(true);
                          toast.success("Password copied to clipboard.");
                          setTimeout(() => setCopied(false), 2000);
                        } else {
                          toast.error("Could not copy to clipboard. Please copy manually from the input.");
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              </div>
              <Input
                id="reset-new-password"
                type="text"
                placeholder="Min 8 characters or auto-generate"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="font-mono text-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-sm"
                disabled={isPending}
                onClick={() => setResetModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="text-sm" disabled={isPending}>
                {isPending && <LoaderCircle className="size-4 animate-spin" />}
                Confirm Password Reset
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
