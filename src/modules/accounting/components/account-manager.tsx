"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { accountTypes } from "../account-types";
import {
  accountSubtypeLabels,
  accountSubtypesByType,
  accountTypeLabels,
  type AccountInput,
} from "../account-input";
import { deleteAccountAction, saveAccountAction } from "../actions";

type AccountRow = AccountInput & {
  id: string;
  isSystem: boolean;
  isActive: boolean;
};

const selectClass =
  "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:opacity-60";

const emptyAccount: AccountInput = {
  code: "",
  name: "",
  type: "expense",
  subtype: "operating_expense",
  isActive: true,
};

export function AccountManager({ businessId, accounts }: { businessId: string; accounts: AccountRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AccountRow | null | undefined>(undefined);
  const [values, setValues] = useState<AccountInput>(emptyAccount);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);

  function openEditor(account?: AccountRow) {
    setEditing(account ?? null);
    setValues(account ? {
      code: account.code,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      isActive: account.isActive,
    } : emptyAccount);
    setErrors({});
    setServerError("");
  }

  async function save() {
    setPending(true);
    setServerError("");
    const result = await saveAccountAction(businessId, editing?.id ?? null, values);
    setPending(false);
    setErrors(result.fieldErrors ?? {});
    if (result.error) return setServerError(result.error);
    setEditing(undefined);
    toast.success(editing ? "Account updated." : "Account created.");
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setPending(true);
    const result = await deleteAccountAction(businessId, deleting.id);
    setPending(false);
    if (result.error) return setServerError(result.error);
    setDeleting(null);
    toast.success("Account deleted.");
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => openEditor()}><Plus className="size-4" /> New Account</Button>
      </div>
      <div className="space-y-5">
        {accountTypes.map((type) => {
          const rows = accounts.filter((account) => account.type === type);
          if (!rows.length) return null;
          return (
            <section key={type} className="data-panel">
              <div className="flex h-11 items-center border-b border-border bg-surface px-4">
                <h2 className="text-sm font-semibold">{accountTypeLabels[type]}</h2>
                <span className="ml-2 text-xs text-muted-foreground">{rows.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[650px]">
                  <thead><tr><th className="w-28">Code</th><th>Account</th><th>Subtype</th><th>Status</th><th className="w-12"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {rows.map((account) => (
                      <tr key={account.id}>
                        <td className="tabular font-medium">{account.code}</td>
                        <td><span className="font-medium">{account.name}</span>{account.isSystem && <Badge className="ml-2">System</Badge>}</td>
                        <td className="text-muted-foreground">{accountSubtypeLabels[account.subtype]}</td>
                        <td><Badge tone={account.isActive ? "success" : "neutral"}>{account.isActive ? "Active" : "Inactive"}</Badge></td>
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${account.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEditor(account)}><Pencil className="size-4" /> Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem disabled={account.isSystem} title={account.isSystem ? "System accounts cannot be deleted" : undefined} className="text-danger focus:text-danger" onSelect={() => { setServerError(""); setDeleting(account); }}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <DialogRoot open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent>
          <DialogTitle>{editing ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>Use a clear code, account type, and reporting subtype.</DialogDescription>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="account-code">Code</Label><Input id="account-code" value={values.code} onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))} aria-invalid={!!errors.code} />{errors.code && <p className="field-error">{errors.code[0]}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="account-name">Name</Label><Input id="account-name" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name[0]}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="account-type">Type</Label><select id="account-type" className={selectClass} value={values.type} disabled={!!editing?.isSystem} onChange={(event) => { const type = event.target.value as AccountInput["type"]; setValues((current) => ({ ...current, type, subtype: accountSubtypesByType[type][0] })); }}>{accountTypes.map((type) => <option key={type} value={type}>{accountTypeLabels[type]}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="account-subtype">Subtype</Label><select id="account-subtype" className={selectClass} value={values.subtype} disabled={!!editing?.isSystem} onChange={(event) => setValues((current) => ({ ...current, subtype: event.target.value as AccountInput["subtype"] }))}>{accountSubtypesByType[values.type].map((subtype) => <option key={subtype} value={subtype}>{accountSubtypeLabels[subtype]}</option>)}</select></div>
            <label className="flex min-h-9 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={values.isActive} disabled={!!editing?.isSystem} onChange={(event) => setValues((current) => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[var(--primary)]" /> Active account</label>
          </div>
          {serverError && <div role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</div>}
          <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(undefined)}>Cancel</Button><Button onClick={save} disabled={pending}>{editing ? "Save changes" : "Create account"}</Button></div>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <DialogContent>
          <DialogTitle>Delete {deleting?.name}?</DialogTitle>
          <DialogDescription>The account can only be deleted when it is not configured or used by any transaction.</DialogDescription>
          {serverError && <div role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</div>}
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove} disabled={pending}>Delete account</Button></div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
