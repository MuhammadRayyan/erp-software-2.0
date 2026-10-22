"use client";

import { useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
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
import { moduleKeys, type ModuleKey } from "@/core/permissions/module-access";
import { addExistingUserAction, createAndAddBusinessUserAction, updateMembershipAction } from "./actions";
import { FormError } from "@/components/form-error";
import { SelectNative } from "@/components/ui/select-native";

type UserAccess = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: "administrator" | "standard";
  modules: ModuleKey[];
  current: boolean;
};

function AccessRow({ businessId, entry }: { businessId: string; entry: UserAccess }) {
  const [role, setRole] = useState(entry.role);
  const [modules, setModules] = useState<ModuleKey[]>(entry.modules);
  const [pending, setPending] = useState(false);

  function toggle(module: ModuleKey) {
    setModules((current) =>
      current.includes(module) ? current.filter((item) => item !== module) : [...current, module]
    );
  }

  async function save() {
    setPending(true);
    const result = await updateMembershipAction(businessId, entry.membershipId, role, modules);
    setPending(false);
    if (result.error) toast.error(result.error);
    else toast.success(`Access updated for ${entry.name}.`);
  }

  return (
    <article className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {entry.name}{" "}
            {entry.current && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{entry.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`role-${entry.membershipId}`} className="sr-only">
            Role
          </Label>
          <SelectNative
            id={`role-${entry.membershipId}`}
            value={role}
            disabled={entry.current}
            onChange={(event) => setRole(event.target.value as typeof role)}
          >
            <option value="administrator">Administrator</option>
            <option value="standard">Standard User</option>
          </SelectNative>
          <Button
            variant="secondary"
            size="sm"
            disabled={entry.current || pending}
            title={entry.current ? "Another administrator must change your access" : undefined}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
      {role === "standard" && (
        <fieldset className="mt-4 border-t border-border pt-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Visible modules</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-3">
            {moduleKeys.map((module) => (
              <label key={module} className="flex min-h-7 items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={modules.includes(module)}
                  disabled={entry.current}
                  onChange={() => toggle(module)}
                  className="size-4 accent-[var(--primary)]"
                />
                {module[0].toUpperCase() + module.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </article>
  );
}

export function UserAccessList({ businessId, users }: { businessId: string; users: UserAccess[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"administrator" | "standard">("standard");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleAdd() {
    setError("");
    setPending(true);

    try {
      if (mode === "existing") {
        const result = await addExistingUserAction(businessId, email);
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success("User assigned to this business.");
      } else {
        if (!name.trim()) {
          setError("Full name is required.");
          return;
        }
        if (!password || password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        const result = await createAndAddBusinessUserAction(businessId, {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(`Team member '${name}' created and assigned to this business.`);
      }

      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <DialogRoot open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <UserPlus className="size-4" /> Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Create a new user or grant access to an existing local account.
            </DialogDescription>

            {/* Mode Toggle */}
            <div className="mt-3 flex rounded-lg border border-border bg-surface p-1 text-xs">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                  mode === "new" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create New User
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                  mode === "existing" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Existing User by Email
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              {mode === "new" && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-name">Full Name</Label>
                  <Input
                    id="new-user-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="user-email">Email Address</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="colleague@company.com"
                />
              </div>

              {mode === "new" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-password">Initial Password</Label>
                    <Input
                      id="new-user-password"
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="font-mono"
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
                </>
              )}
            </div>

            {error && <div className="mt-3"><FormError message={error} /></div>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={pending} onClick={handleAdd}>
                {mode === "new" ? "Create & Assign" : "Assign User"}
              </Button>
            </div>
          </DialogContent>
        </DialogRoot>
      </div>

      <div className="space-y-3">
        {users.map((entry) => (
          <AccessRow key={entry.membershipId} businessId={businessId} entry={entry} />
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-info/20 bg-info/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="text-muted-foreground">
          Unavailable modules disappear from navigation. Server-side route checks use the same membership, so a hidden module cannot be opened directly.
        </p>
      </div>
    </>
  );
}
