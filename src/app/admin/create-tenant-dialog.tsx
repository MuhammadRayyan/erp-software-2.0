"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, LoaderCircle, Sparkles, UserPlus } from "lucide-react";
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
import { FormError } from "@/components/form-error";
import { copyToClipboard } from "@/lib/clipboard";
import { createTenantAction } from "./actions";

function generateSecurePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";
  const maxValid = Math.floor(0x100000000 / chars.length) * chars.length;
  const buf = new Uint32Array(1);
  let pwd = "";
  while (pwd.length < 16) {
    crypto.getRandomValues(buf);
    if (buf[0] < maxValid) {
      pwd += chars.charAt(buf[0] % chars.length);
    }
  }
  return pwd;
}

export function CreateTenantDialog({
  onCreated,
}: {
  onCreated?: (tenant: { id: string; name: string; email: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [maxBusinesses, setMaxBusinesses] = useState("3");
  const [maxUsers, setMaxUsers] = useState("5");
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    maxBusinesses?: string;
    maxUsers?: string;
  }>({});
  const [isPending, startTransition] = useTransition();

  function handleGeneratePassword() {
    const generated = generateSecurePassword();
    setPassword(generated);
    setCopied(false);
    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
  }

  async function handleCopyCredentials() {
    const text = `UAE Manager Account\nName: ${name}\nEmail: ${email}\nPassword: ${password}`;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast.success("Credentials copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy to clipboard. Please copy manually from the input.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const nextErrors: {
      name?: string;
      email?: string;
      password?: string;
      maxBusinesses?: string;
      maxUsers?: string;
    } = {};

    if (!name.trim()) nextErrors.name = "Full name is required.";
    if (!email.trim() || !email.includes("@")) nextErrors.email = "A valid email address is required.";
    if (!password || password.length < 8) nextErrors.password = "Password must be at least 8 characters.";

    const rawBusinesses = Number(maxBusinesses.trim());
    const rawUsers = Number(maxUsers.trim());

    if (!Number.isInteger(rawBusinesses) || rawBusinesses < 1 || rawBusinesses > 1000) {
      nextErrors.maxBusinesses = "Max businesses must be a whole number between 1 and 1000.";
    }
    if (!Number.isInteger(rawUsers) || rawUsers < 1 || rawUsers > 10000) {
      nextErrors.maxUsers = "Max sub-users must be a whole number between 1 and 10000.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    const parsedBusinesses = rawBusinesses;
    const parsedUsers = rawUsers;

    startTransition(async () => {
      const result = await createTenantAction({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        maxBusinesses: parsedBusinesses,
        maxUsers: parsedUsers,
      });

      if (result.success && result.data) {
        toast.success(`Account holder '${result.data.name}' created successfully!`);
        onCreated?.(result.data);
        setOpen(false);
        setName("");
        setEmail("");
        setPassword("");
        setMaxBusinesses("3");
        setMaxUsers("5");
        setFormError("");
        setFieldErrors({});
      } else {
        const msg = result.error || "Failed to create account holder.";
        setFormError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        setOpen(next);
        if (!next) {
          setPassword("");
          setCopied(false);
          setFormError("");
          setFieldErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" className="gap-1.5 text-xs">
          <UserPlus className="size-3.5" /> New Account Holder
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <UserPlus className="size-4" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-foreground">
              Provision New Account Holder
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">
              Create an account holder (main tenant). They can create businesses and manage users up to their quota limits.
            </DialogDescription>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-sm" noValidate>
          {formError && <FormError message={formError} />}
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">Full Name</Label>
            <Input
              id="tenant-name"
              placeholder="e.g. John Doe / Acme Corp Lead"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
              }}
              required
              aria-invalid={!!fieldErrors.name}
              className="text-sm"
            />
            {fieldErrors.name && <FormError message={fieldErrors.name} />}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-email">Email Address</Label>
            <Input
              id="tenant-email"
              type="email"
              placeholder="tenant@clientdomain.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
              }}
              required
              aria-invalid={!!fieldErrors.email}
              className="text-sm"
            />
            {fieldErrors.email && <FormError message={fieldErrors.email} />}
          </div>

          {/* Password with generator & copy */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tenant-password">Temporary Password</Label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Sparkles className="size-3.5" /> Auto-Generate
                </button>
                {password && (
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tenant-password"
                type="text"
                placeholder="Min 8 characters or auto-generate"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                }}
                required
                aria-invalid={!!fieldErrors.password}
                className="pl-9 font-mono text-sm"
              />
            </div>
            {fieldErrors.password && <FormError message={fieldErrors.password} />}
          </div>

          {/* Quotas */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="max-businesses">Max Businesses Quota</Label>
              <Input
                id="max-businesses"
                type="number"
                min="1"
                max="1000"
                value={maxBusinesses}
                onChange={(e) => {
                  setMaxBusinesses(e.target.value);
                  if (fieldErrors.maxBusinesses) setFieldErrors((p) => ({ ...p, maxBusinesses: undefined }));
                }}
                required
                aria-invalid={!!fieldErrors.maxBusinesses}
                className="text-sm"
              />
              {fieldErrors.maxBusinesses ? (
                <FormError message={fieldErrors.maxBusinesses} />
              ) : (
                <span className="text-xs text-muted-foreground">Workspaces they can create</span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max-users">Max Sub-Users Quota</Label>
              <Input
                id="max-users"
                type="number"
                min="1"
                max="10000"
                value={maxUsers}
                onChange={(e) => {
                  setMaxUsers(e.target.value);
                  if (fieldErrors.maxUsers) setFieldErrors((p) => ({ ...p, maxUsers: undefined }));
                }}
                required
                aria-invalid={!!fieldErrors.maxUsers}
                className="text-sm"
              />
              {fieldErrors.maxUsers ? (
                <FormError message={fieldErrors.maxUsers} />
              ) : (
                <span className="text-xs text-muted-foreground">Team members across businesses</span>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isPending}
              className="gap-1.5"
            >
              {isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              Create Account Holder
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
