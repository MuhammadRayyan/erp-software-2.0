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
import { copyToClipboard } from "./clipboard";
import { createTenantAction } from "./actions";

function generateSecurePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";
  let pwd = "";
  for (let i = 0; i < 16; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
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
  const [isPending, startTransition] = useTransition();

  function handleGeneratePassword() {
    const generated = generateSecurePassword();
    setPassword(generated);
  }

  async function handleCopyCredentials() {
    const text = `Ledgerly ERP Account\nName: ${name}\nEmail: ${email}\nPassword: ${password}`;
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

    if (!name.trim()) return toast.error("Full name is required.");
    if (!email.trim() || !email.includes("@")) return toast.error("A valid email address is required.");
    if (!password || password.length < 8) return toast.error("Password must be at least 8 characters.");

    const parsedBusinesses = parseInt(maxBusinesses, 10);
    const parsedUsers = parseInt(maxUsers, 10);

    if (isNaN(parsedBusinesses) || parsedBusinesses < 1) {
      return toast.error("Max businesses must be at least 1.");
    }
    if (isNaN(parsedUsers) || parsedUsers < 1) {
      return toast.error("Max sub-users must be at least 1.");
    }

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
      } else {
        toast.error(result.error || "Failed to create account holder.");
      }
    });
  }

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" className="gap-1.5 text-xs">
          <UserPlus className="size-3.5" /> + New Account Holder
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">Full Name</Label>
            <Input
              id="tenant-name"
              placeholder="e.g. John Doe / Acme Corp Lead"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="text-xs"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-email">Email Address</Label>
            <Input
              id="tenant-email"
              type="email"
              placeholder="tenant@clientdomain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="text-xs"
            />
          </div>

          {/* Password with generator & copy */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tenant-password">Temporary Password</Label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Sparkles className="size-3" /> Auto-Generate
                </button>
                {password && (
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tenant-password"
                type="text"
                placeholder="Min 8 characters or auto-generate"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-9 font-mono text-xs"
              />
            </div>
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
                onChange={(e) => setMaxBusinesses(e.target.value)}
                required
                className="text-xs"
              />
              <span className="text-[10px] text-muted-foreground">Workspaces they can create</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max-users">Max Sub-Users Quota</Label>
              <Input
                id="max-users"
                type="number"
                min="1"
                max="10000"
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value)}
                required
                className="text-xs"
              />
              <span className="text-[10px] text-muted-foreground">Team members across businesses</span>
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
