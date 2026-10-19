"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, Shield, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/form-error";
import { changePasswordAction, updateDisplayNameAction } from "./actions";

type ProfileProps = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  role: string;
};

export function ProfileClient({ user, role }: ProfileProps) {
  const router = useRouter();

  // Display Name state
  const [displayName, setDisplayName] = useState(user.name);
  const [savedName, setSavedName] = useState(user.name);
  const [namePending, setNamePending] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    setNameSuccess(false);

    const trimmed = displayName.trim();
    if (trimmed.length < 2) {
      setNameError("Display name must be at least 2 characters long.");
      return;
    }

    setNamePending(true);
    const res = await updateDisplayNameAction(trimmed);
    setNamePending(false);

    if (res.error) {
      setNameError(res.error);
      toast.error(res.error);
    } else {
      setDisplayName(trimmed);
      setSavedName(trimmed);
      setNameSuccess(true);
      toast.success("Display name updated successfully.");
      router.refresh();
      setTimeout(() => setNameSuccess(false), 4000);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword.length > 128) {
      setPasswordError("New password cannot exceed 128 characters.");
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from current password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordPending(true);
    const res = await changePasswordAction(currentPassword, newPassword, revokeOthers);
    setPasswordPending(false);

    if (res.error) {
      setPasswordError(res.error);
      toast.error(res.error);
    } else {
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Account Overview Header Card */}
      <div className="rounded-lg border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary font-semibold text-xl">
              {savedName ? savedName.charAt(0).toUpperCase() : <UserRound className="size-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{savedName}</h2>
                <Badge tone={role === "administrator" ? "info" : "neutral"} className="capitalize">
                  <Shield className="size-3 mr-1" />
                  {role}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-surface-muted/50 rounded-md px-3 py-2 border border-border/50 max-w-xs">
            <span className="font-medium text-foreground">Active Session:</span> Managed via secure, HTTP-only session cookies.
          </div>
        </div>
      </div>

      {/* Profile Details Form */}
      <div className="rounded-lg border border-border bg-surface p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <UserRound className="size-4 text-primary" /> Display Name
          </h3>
          <p className="text-sm text-muted-foreground">
            Update how your name appears on activity logs, document histories, and notifications.
          </p>
        </div>

        {nameError && <FormError message={nameError} />}

        <form onSubmit={handleUpdateName} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Full Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (nameError) setNameError("");
              }}
              placeholder="Your full name"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="emailReadonly">Email Address</Label>
            <Input
              id="emailReadonly"
              value={user.email}
              disabled
              readOnly
              className="bg-surface-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="text-[12px] text-muted-foreground">
              Email changes are managed through administrator directory settings.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={namePending || displayName.trim() === savedName || displayName.trim().length < 2}>
              {namePending ? <LoaderCircle className="size-4 animate-spin" /> : "Save Name"}
            </Button>
            {nameSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Check className="size-4" /> Name updated
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Password & Security Card */}
      <div className="rounded-lg border border-border bg-surface p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <KeyRound className="size-4 text-primary" /> Change Password
          </h3>
          <p className="text-sm text-muted-foreground">
            Ensure your account is protected with a secure password of at least 8 characters.
          </p>
        </div>

        {passwordError && <FormError message={passwordError} />}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Enter current password"
                className="pr-10"
                maxLength={128}
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((p) => !p)}
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="At least 8 characters"
                className="pr-10"
                minLength={8}
                maxLength={128}
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((p) => !p)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-[12px] text-amber-600 dark:text-amber-400">
                Password must be at least 8 characters long (currently {newPassword.length}).
              </p>
            )}
            {newPassword.length >= 8 && currentPassword === newPassword && (
              <p className="text-[12px] text-amber-600 dark:text-amber-400">
                New password must be different from current password.
              </p>
            )}
            {newPassword.length > 128 && (
              <p className="text-[12px] text-destructive">
                Password cannot exceed 128 characters.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Re-enter new password"
                className="pr-10"
                maxLength={128}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-[12px] text-destructive">
                Passwords do not match.
              </p>
            )}
          </div>

          <div className="pt-1">
            <label htmlFor="revokeOthers" className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
              <input
                id="revokeOthers"
                type="checkbox"
                checked={revokeOthers}
                onChange={(e) => setRevokeOthers(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary/20 accent-primary"
              />
              <span>Sign out of all other active devices and sessions</span>
            </label>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={
                passwordPending ||
                !currentPassword ||
                newPassword.length < 8 ||
                newPassword.length > 128 ||
                currentPassword === newPassword ||
                newPassword !== confirmPassword
              }
            >
              {passwordPending ? <LoaderCircle className="size-4 animate-spin" /> : "Update Password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
