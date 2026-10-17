"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, FilePlus2, MoreHorizontal, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { formatMoney } from "@/core/format";
import { FormError } from "@/components/form-error";
import { addProjectCustomerAction, removeProjectCustomerAction } from "./actions";
import { ProjectCustomerRoleBadge } from "./project-status";
import type { ProjectCustomerSummary } from "./project-service";
import type { ProjectCustomerRole } from "./project-input";

export function ProjectStakeholders({
  businessId,
  projectId,
  currency,
  customers,
  allCustomers,
}: {
  businessId: string;
  projectId: string;
  currency: string;
  customers: ProjectCustomerSummary[];
  allCustomers: Array<{ id: string; name: string }>;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedRole, setSelectedRole] = useState<ProjectCustomerRole>("co_client");
  const [billingPercentage, setBillingPercentage] = useState("");
  const [notes, setNotes] = useState("");

  // Customer removal confirmation state
  const [removingCustomer, setRemovingCustomer] = useState<ProjectCustomerSummary | null>(null);

  const availableCustomers = allCustomers.filter(
    (c) => !customers.some((existing) => existing.customerId === c.id),
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) {
      setError("Please select a customer.");
      return;
    }
    setPending(true);
    setError("");
    const result = await addProjectCustomerAction(businessId, projectId, {
      customerId: selectedCustomerId,
      role: selectedRole,
      billingPercentage: billingPercentage || undefined,
      notes: notes || undefined,
      isPrimary: selectedRole === "primary_client",
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Client added to project.");
    setOpenAdd(false);
    setSelectedCustomerId("");
    setSelectedRole("co_client");
    setBillingPercentage("");
    setNotes("");
  }

  async function handleRemove() {
    if (!removingCustomer) return;
    setPending(true);
    setError("");
    const result = await removeProjectCustomerAction(businessId, projectId, removingCustomer.customerId);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Client removed from project.");
    setRemovingCustomer(null);
  }

  return (
    <div className="data-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Clients & Stakeholders</h2>
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted-foreground border border-border">
              {customers.length} {customers.length === 1 ? "Client" : "Clients"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Projects can have multiple clients, joint-venture partners, or tenants billed under the same project umbrella.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => { setError(""); setOpenAdd(true); }}>
          <UserPlus className="size-4" /> Add Client / Stakeholder
        </Button>
      </div>

      {customers.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[780px]">
            <thead>
              <tr>
                <th>Client / Stakeholder</th>
                <th>Project Role</th>
                <th>Contact</th>
                <th className="text-right!">Share %</th>
                <th className="text-right!">Invoiced (Net)</th>
                <th className="text-right!">Collected</th>
                <th className="text-right!">Outstanding</th>
                <th className="text-right!">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const invoiceHref = `/b/${businessId}/sales/invoices/new?projectId=${projectId}&customerId=${c.customerId}`;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Building2 className="size-4 text-muted-foreground shrink-0" />
                        <div>
                          <Link
                            href={`/b/${businessId}/customers/${c.customerId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {c.customerName}
                          </Link>
                          {c.isPrimary && (
                            <span className="ml-2 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                              Primary
                            </span>
                          )}
                          {c.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{c.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <ProjectCustomerRoleBadge role={c.role} />
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {c.customerEmail ? <div>{c.customerEmail}</div> : null}
                      {c.customerPhone ? <div>{c.customerPhone}</div> : null}
                      {!c.customerEmail && !c.customerPhone && "—"}
                    </td>
                    <td className="money text-right">
                      {c.billingPercentage !== null ? `${c.billingPercentage}%` : "—"}
                    </td>
                    <td className="money text-right">{formatMoney(c.invoicedMinor, currency)}</td>
                    <td className="money text-right text-success">{formatMoney(c.collectedMinor, currency)}</td>
                    <td className="money text-right font-medium">
                      {formatMoney(c.outstandingMinor, currency)}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                          <Link href={invoiceHref}>
                            <FilePlus2 className="size-3.5 mr-1" /> Invoice
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={invoiceHref}>New Sales Invoice</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/b/${businessId}/sales/quotes/new?projectId=${projectId}&customerId=${c.customerId}`}>
                                New Sales Quote
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/b/${businessId}/sales/orders/new?projectId=${projectId}&customerId=${c.customerId}`}>
                                New Sales Order
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/b/${businessId}/customers/${c.customerId}`}>
                                View Customer Profile
                              </Link>
                            </DropdownMenuItem>
                            {!c.isPrimary && (
                              <DropdownMenuItem
                                className="text-danger"
                                onSelect={() => {
                                  setError("");
                                  setRemovingCustomer(c);
                                }}
                              >
                                <Trash2 className="size-4 mr-2" /> Remove from Project
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No clients or stakeholders assigned to this project yet.
        </div>
      )}

      {/* Add Client Dialog */}
      <DialogRoot open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className="max-w-md">
          <DialogTitle>Add Client / Stakeholder</DialogTitle>
          <DialogDescription>
            Associate a customer with this project to enable multi-client billing, joint-venture split tracking, or tenant fit-out contracts.
          </DialogDescription>
          {error && <FormError message={error} />}
          <form onSubmit={handleAdd} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="customerSelect">Customer</Label>
              <SelectNative
                id="customerSelect"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                required
              >
                <option value="">Select a customer…</option>
                {availableCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectNative>
              {availableCustomers.length === 0 && (
                <p className="text-xs text-muted-foreground">All existing customers are already attached to this project.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="roleSelect">Project Role</Label>
                <SelectNative
                  id="roleSelect"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as ProjectCustomerRole)}
                >
                  <option value="co_client">Co-Client</option>
                  <option value="joint_venture">Joint Venture Partner</option>
                  <option value="tenant">Tenant / Fit-Out</option>
                  <option value="bill_to">Bill-To Party</option>
                  <option value="sponsor">Project Sponsor</option>
                  <option value="consultant">Consultant / Rep</option>
                  <option value="primary_client">Primary Client</option>
                </SelectNative>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="splitPercent">Share / Split % <span className="font-normal text-muted-foreground">(opt)</span></Label>
                <Input
                  id="splitPercent"
                  placeholder="e.g. 50"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={billingPercentage}
                  onChange={(e) => setBillingPercentage(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stakeholderNotes">Notes / Scope <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="stakeholderNotes"
                placeholder="e.g. Fit-out for Floor 4, or 50% MEP Consortium Partner"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || !selectedCustomerId}>
                {pending ? "Adding…" : "Add Client"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>

      {/* Remove Confirmation Dialog */}
      <DialogRoot open={Boolean(removingCustomer)} onOpenChange={(open) => !open && setRemovingCustomer(null)}>
        <DialogContent>
          <DialogTitle>Remove client from project?</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{removingCustomer?.customerName}</strong> from this project? Clients with existing billed invoices or linked orders cannot be removed.
          </DialogDescription>
          {error && <FormError message={error} />}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" disabled={pending} onClick={handleRemove}>
              {pending ? "Removing…" : "Remove Client"}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
