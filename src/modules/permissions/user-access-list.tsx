"use client";

import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moduleKeys, type ModuleKey } from "@/core/permissions/module-access";
import { addExistingUserAction, updateMembershipAction } from "./actions";

type UserAccess = { membershipId: string; userId: string; name: string; email: string; role: "administrator" | "standard"; modules: ModuleKey[]; current: boolean };
const selectClass = "h-9 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

function AccessRow({ businessId, entry }: { businessId: string; entry: UserAccess }) {
  const [role, setRole] = useState(entry.role); const [modules, setModules] = useState<ModuleKey[]>(entry.modules); const [pending, setPending] = useState(false);
  function toggle(module: ModuleKey) { setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]); }
  async function save() { setPending(true); const result = await updateMembershipAction(businessId, entry.membershipId, role, modules); setPending(false); if (result.error) toast.error(result.error); else toast.success(`Access updated for ${entry.name}.`); }
  return <article className="rounded-lg border border-border bg-surface-raised p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{entry.name} {entry.current && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}</p><p className="mt-1 text-xs text-muted-foreground">{entry.email}</p></div><div className="flex items-center gap-2"><Label htmlFor={`role-${entry.membershipId}`} className="sr-only">Role</Label><select id={`role-${entry.membershipId}`} className={selectClass} value={role} disabled={entry.current} onChange={(event) => setRole(event.target.value as typeof role)}><option value="administrator">Administrator</option><option value="standard">Standard User</option></select><Button variant="secondary" size="sm" disabled={entry.current || pending} title={entry.current ? "Another administrator must change your access" : undefined} onClick={save}>Save</Button></div></div>{role === "standard" && <fieldset className="mt-4 border-t border-border pt-4"><legend className="px-1 text-xs font-medium text-muted-foreground">Visible modules</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-3">{moduleKeys.map((module) => <label key={module} className="flex min-h-7 items-center gap-2 text-[13px]"><input type="checkbox" checked={modules.includes(module)} disabled={entry.current} onChange={() => toggle(module)} className="size-4 accent-[var(--primary)]" />{module[0].toUpperCase() + module.slice(1)}</label>)}</div></fieldset>}</article>;
}

export function UserAccessList({ businessId, users }: { businessId: string; users: UserAccess[] }) {
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(""); const [error, setError] = useState("");
  async function add() { setError(""); const result = await addExistingUserAction(businessId, email); if (result.error) return setError(result.error); setOpen(false); setEmail(""); toast.success("User assigned to this business."); }
  return <><div className="mb-4 flex justify-end"><DialogRoot open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="size-4" /> Add local user</Button></DialogTrigger><DialogContent><DialogTitle>Add an existing local user</DialogTitle><DialogDescription>Add an existing local user by email. Invitation emails are not available.</DialogDescription><div className="mt-5 space-y-1.5"><Label htmlFor="user-email">Email</Label><Input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="standard@demo.local" /></div>{error && <div role="alert" className="mt-3 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}<div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Add user</Button></div></DialogContent></DialogRoot></div><div className="space-y-3">{users.map((entry) => <AccessRow key={entry.membershipId} businessId={businessId} entry={entry} />)}</div><div className="mt-5 flex items-start gap-3 rounded-lg border border-info/20 bg-info/5 p-4 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" /><p className="text-muted-foreground">Unavailable modules disappear from navigation. Server-side route checks use the same membership, so a hidden module cannot be opened directly.</p></div></>;
}
