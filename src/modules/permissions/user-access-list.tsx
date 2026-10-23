"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Mail,
  RotateCcw,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,

} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { moduleKeys, type ModuleKey } from "@/core/permissions/module-access";
import {
  createInvitationLinkAction,
  createPasswordResetLinkAction,
  inviteBusinessUserAction,
  removeBusinessUserAction,
  resendInvitationAction,
  sendPasswordResetAction,
  toggleUserSuspensionAction,
  updateMembershipAction,
} from "./actions";
import { FormError } from "@/components/form-error";
import { SelectNative } from "@/components/ui/select-native";
import { copyToClipboard } from "@/lib/clipboard";

export type UserAccess = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: "administrator" | "standard";
  modules: ModuleKey[];
  current: boolean;
  status: "registered" | "invited" | "suspended";
  isOwner?: boolean;
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  sales: "Sales & Invoicing",
  purchases: "Purchases & Bills",
  banking: "Banking & Accounts",
  projects: "Projects",
  inventory: "Inventory",
  accounting: "General Ledger & Accounting",
  reports: "Financial Reports & VAT",
  payroll: "HR & Payroll",
  settings: "Settings",
};

function StatusBadge({ status }: { status: UserAccess["status"] }) {
  if (status === "invited") {
    return (
      <Badge tone="warning" className="gap-1 font-normal text-xs">
        <Mail className="size-3" /> Invitation Sent
      </Badge>
    );
  }
  if (status === "suspended") {
    return (
      <Badge tone="danger" className="gap-1 font-normal text-xs">
        <Ban className="size-3" /> Suspended
      </Badge>
    );
  }
  return (
    <Badge tone="success" className="gap-1 font-normal text-xs">
      <CheckCircle2 className="size-3" /> Registered
    </Badge>
  );
}

function AccessRow({
  businessId,
  entry,
  onDeleted,
}: {
  businessId: string;
  entry: UserAccess;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState(entry.role);
  const [modules, setModules] = useState<ModuleKey[]>(entry.modules);
  const [status, setStatus] = useState<UserAccess["status"]>(entry.status);
  const [pending, setPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    setRole(entry.role);
    setModules(entry.modules);
    setStatus(entry.status);
  }, [entry.role, entry.modules, entry.status]);

  function toggle(module: ModuleKey) {
    setModules((current) =>
      current.includes(module) ? current.filter((item) => item !== module) : [...current, module]
    );
  }

  function selectAllModules() {
    setModules([...moduleKeys]);
  }

  function deselectAllModules() {
    setModules(["sales"]);
  }

  async function save() {
    setPending(true);
    const result = await updateMembershipAction(businessId, entry.membershipId, role, modules);
    setPending(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success(`Access updated for ${entry.name}.`);
      router.refresh();
    }
  }

  async function handleCopyInviteLink() {
    setActionPending(true);
    const result = await createInvitationLinkAction(businessId, entry.userId);
    setActionPending(false);
    if (result.error) {
      toast.error(result.error);
    } else if (result.data?.inviteUrl) {
      const copied = await copyToClipboard(result.data.inviteUrl);
      if (copied) {
        toast.success("Invitation setup link copied to clipboard!");
      } else {
        toast.info(`Invitation link: ${result.data.inviteUrl}`);
      }
    }
  }

  async function handleCopyResetLink() {
    setActionPending(true);
    const result = await createPasswordResetLinkAction(businessId, entry.userId);
    setActionPending(false);
    if (result.error) {
      toast.error(result.error);
    } else if (result.data?.resetUrl) {
      const copied = await copyToClipboard(result.data.resetUrl);
      if (copied) {
        toast.success("Password reset link copied to clipboard!");
      } else {
        toast.info(`Reset link: ${result.data.resetUrl}`);
      }
    }
  }

  async function handleResendInvite() {
    setActionPending(true);
    const result = await resendInvitationAction(businessId, entry.userId);
    setActionPending(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      if (result.data?.emailDelivery && !result.data.emailDelivery.success) {
        toast.warning(
          `Invitation regenerated, but email delivery failed: ${result.data.emailDelivery.error || "SMTP offline"}.`
        );
      } else {
        toast.success(`Invitation email resent to ${entry.email}.`);
      }
      if (result.data?.inviteUrl) {
        await copyToClipboard(result.data.inviteUrl);
      }
      router.refresh();
    }
  }

  async function handleSendResetPassword() {
    setActionPending(true);
    const result = await sendPasswordResetAction(businessId, entry.userId);
    setActionPending(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      if (result.data?.emailDelivery && !result.data.emailDelivery.success) {
        toast.warning(
          `Password reset generated, but email delivery failed: ${result.data.emailDelivery.error || "SMTP offline"}.`
        );
      } else {
        toast.success(`Password reset email sent to ${entry.email}.`);
      }
      if (result.data?.resetUrl) {
        await copyToClipboard(result.data.resetUrl);
      }
      router.refresh();
    }
  }

  async function handleToggleSuspension() {
    const nextStatus = status === "suspended" ? "active" : "suspended";
    setActionPending(true);
    const result = await toggleUserSuspensionAction(businessId, entry.userId, nextStatus);
    setActionPending(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      const resolvedStatus = nextStatus === "suspended" ? "suspended" : (entry.status === "invited" ? "invited" : "registered");
      setStatus(resolvedStatus);
      toast.success(
        nextStatus === "suspended"
          ? `User ${entry.name} has been suspended.`
          : `User ${entry.name} has been reactivated.`
      );
      router.refresh();
    }
  }

  async function handleRemoveUser() {
    if (!confirm(`Are you sure you want to remove ${entry.name} (${entry.email}) from this business workspace?`)) {
      return;
    }
    setActionPending(true);
    const result = await removeBusinessUserAction(businessId, entry.membershipId);
    setActionPending(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Removed ${entry.name} from business.`);
      onDeleted?.();
      router.refresh();
    }
  }


  return (
    <article className="rounded-lg border border-border bg-surface-raised p-4 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
              <span>{entry.name}</span>
              {entry.current && (
                <span className="text-xs font-normal text-muted-foreground">(you)</span>
              )}
              {entry.isOwner && (
                <Badge tone="neutral" className="gap-1 font-normal text-[11px] py-0 px-1.5">
                  <Shield className="size-3 text-primary" /> Owner
                </Badge>
              )}
            </p>
            <StatusBadge status={status} />
          </div>
          <p className="text-xs text-muted-foreground">{entry.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`role-${entry.membershipId}`} className="sr-only">
            Role
          </Label>
          <SelectNative
            id={`role-${entry.membershipId}`}
            value={role}
            disabled={entry.current || entry.isOwner}
            title={
              entry.isOwner
                ? "The workspace owner must remain an administrator"
                : entry.current
                  ? "Another administrator must change your access"
                  : undefined
            }
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="text-xs h-8"
          >
            <option value="administrator">Administrator</option>
            <option value="standard">Standard User</option>
          </SelectNative>
          <Button
            variant="secondary"
            size="sm"
            disabled={entry.current || entry.isOwner || pending}
            title={
              entry.isOwner
                ? "The workspace owner must remain an administrator"
                : entry.current
                  ? "Another administrator must change your access"
                  : undefined
            }
            onClick={save}
            className="h-8 text-xs"
          >
            Save Access
          </Button>

          {/* User Actions */}
          {!entry.current && (
            <div className="flex items-center gap-1.5 ml-2 border-l border-border pl-3">
              {status === "invited" ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={actionPending}
                    onClick={handleCopyInviteLink}
                    title="Generate & copy setup link without sending email"
                    className="h-8 text-xs gap-1"
                  >
                    <Copy className="size-3.5" />
                    Copy Link
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={actionPending}
                    onClick={handleResendInvite}
                    title="Resend invitation email"
                    className="h-8 text-xs gap-1"
                  >
                    <RotateCcw className="size-3.5" />
                    Resend Email
                  </Button>

                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={actionPending || status === "suspended"}
                    onClick={handleCopyResetLink}
                    title="Generate & copy password reset link without sending email"
                    className="h-8 text-xs gap-1"
                  >
                    <Copy className="size-3.5" />
                    Copy Reset Link
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={actionPending || status === "suspended"}
                    onClick={handleSendResetPassword}
                    title="Send password reset link to user's email"
                    className="h-8 text-xs gap-1"
                  >
                    <KeyRound className="size-3.5" />
                    Reset Email
                  </Button>
                </>
              )}

              {!entry.isOwner && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={actionPending}
                    onClick={handleToggleSuspension}
                    title={status === "suspended" ? "Reactivate user" : "Suspend user"}
                    className={`h-8 text-xs gap-1 ${
                      status === "suspended"
                        ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        : "text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    }`}
                  >
                    {status === "suspended" ? (
                      <>
                        <UserCheck className="size-3.5" /> Reactivate
                      </>
                    ) : (
                      <>
                        <Ban className="size-3.5" /> Suspend
                      </>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={actionPending}
                    onClick={handleRemoveUser}
                    title="Remove user from this business"
                    className="h-8 text-xs text-danger hover:text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>


      {role === "standard" && (
        <fieldset className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Visible Modules & Access
            </legend>
            {!entry.current && (
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllModules}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={deselectAllModules}
                  className="text-muted-foreground hover:underline cursor-pointer"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
            {moduleKeys.map((module) => (
              <label
                key={module}
                className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={modules.includes(module)}
                  disabled={entry.current}
                  onChange={() => toggle(module)}
                  className="size-4 rounded border-border accent-primary focus:ring-primary/20"
                />
                <span>{MODULE_LABELS[module] || module}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </article>
  );
}

export function UserAccessList({ businessId, users }: { businessId: string; users: UserAccess[] }) {
  const router = useRouter();
  const [items, setItems] = useState<UserAccess[]>(users);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"administrator" | "standard">("standard");
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>([
    "sales",
    "purchases",
    "inventory",
  ]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setItems(users);
  }, [users]);

  function toggleInviteModule(module: ModuleKey) {
    setSelectedModules((curr) =>
      curr.includes(module) ? curr.filter((m) => m !== module) : [...curr, module]
    );
  }

  async function handleInvite(sendEmail: boolean = true) {
    setError("");
    setCreatedInviteUrl(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }

    setPending(true);

    try {
      const result = await inviteBusinessUserAction(businessId, {
        email: cleanEmail,
        role,
        modules: role === "standard" ? selectedModules : moduleKeys as unknown as string[],
        sendEmail,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data) {
        if (result.data.status === "registered") {
          toast.success(`Team member (${cleanEmail}) added to workspace.`);
          setOpen(false);
          setEmail("");
          router.refresh();
        } else {
          if (!sendEmail) {
            toast.success(`Invitation link generated for ${cleanEmail}!`);
          } else if (result.data.emailDelivery && !result.data.emailDelivery.success) {
            toast.warning(
              `Invitation created, but email delivery failed: ${result.data.emailDelivery.error || "SMTP offline"}. Please share the direct registration link.`
            );
          } else {
            toast.success(`Invitation link sent to ${cleanEmail}.`);
          }
          if (result.data.inviteUrl) {
            setCreatedInviteUrl(result.data.inviteUrl);
            await copyToClipboard(result.data.inviteUrl);
          } else {
            setOpen(false);
            setEmail("");
          }
          router.refresh();
        }
      }
    } finally {
      setPending(false);
    }
  }

  async function handleCopyInvite() {
    if (createdInviteUrl) {
      const copied = await copyToClipboard(createdInviteUrl);
      if (copied) {
        setCopiedLink(true);
        toast.success("Invitation link copied to clipboard!");
        setTimeout(() => setCopiedLink(false), 3000);
      } else {
        toast.info(`Invite link: ${createdInviteUrl}`);
      }
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "team member" : "team members"} total
          </p>
        </div>
        <DialogRoot
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) {
              setError("");
              setCreatedInviteUrl(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <UserPlus className="size-4" /> Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Enter the colleague&apos;s email address and assign their role. You can send a setup link
              by email or generate a direct setup link to copy and share.
            </DialogDescription>

            {createdInviteUrl ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    Invitation Link Ready
                  </div>
                  <p className="mt-1 text-muted-foreground dark:text-emerald-300/80">
                    The registration setup link is ready. You can copy and share it with your colleague:
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      readOnly
                      value={createdInviteUrl}
                      className="text-xs font-mono bg-surface"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCopyInvite}
                      className="shrink-0 gap-1"
                    >
                      {copiedLink ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedLink ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      setOpen(false);
                      setEmail("");
                      setCreatedInviteUrl(null);
                      router.refresh();
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <Label htmlFor="user-email">Email Address</Label>
                    <Input
                      id="user-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="colleague@company.com"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-role">Role</Label>
                    <SelectNative
                      id="new-user-role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as typeof role)}
                    >
                      <option value="standard">Standard User (Selective module access)</option>
                      <option value="administrator">Administrator (Full business access)</option>
                    </SelectNative>
                  </div>

                  {role === "standard" && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <Label>Initial Visible Modules</Label>
                        <button
                          type="button"
                          onClick={() => setSelectedModules([...moduleKeys])}
                          className="text-[11px] text-primary hover:underline cursor-pointer"
                        >
                          Select all
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        {moduleKeys.map((mod) => (
                          <label
                            key={mod}
                            className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={selectedModules.includes(mod)}
                              onChange={() => toggleInviteModule(mod)}
                              className="size-3.5 rounded border-border accent-primary"
                            />
                            <span>{MODULE_LABELS[mod]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mt-3">
                    <FormError message={error} />
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2 flex-wrap">
                  <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => handleInvite(false)}
                    className="gap-1.5"
                    title="Generate direct link without sending an email"
                  >
                    <Copy className="size-3.5" />
                    {pending ? "Creating..." : "Create & Copy Link"}
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => handleInvite(true)}
                    className="gap-1.5"
                  >
                    <Send className="size-3.5" />
                    {pending ? "Sending..." : "Send Login Link"}
                  </Button>
                </div>
              </>
            )}

          </DialogContent>
        </DialogRoot>
      </div>

      <div className="space-y-3">
        {items.map((entry) => (
          <AccessRow
            key={entry.membershipId}
            businessId={businessId}
            entry={entry}
            onDeleted={() => {
              setItems((prev) => prev.filter((item) => item.membershipId !== entry.membershipId));
            }}
          />
        ))}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-lg border border-info/20 bg-info/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
        <div className="text-muted-foreground text-xs leading-relaxed space-y-1">
          <p className="font-medium text-foreground">Selective Module & Access Enforcement</p>
          <p>
            When a standard user is assigned specific modules, hidden modules are automatically removed
            from their navigation sidebar. Route permissions are validated on the server for every page
            and action, preventing unauthorized access.
          </p>
        </div>
      </div>
    </>
  );
}
