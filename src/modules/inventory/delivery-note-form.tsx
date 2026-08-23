"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Columns3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDeliveryNoteAction } from "./delivery-note-actions";
import {
  deliveryNoteInputSchema,
  type DeliveryNoteInput,
} from "./delivery-note-input";
import type { InventoryDocumentStatus } from "./inventory-document";
import { SelectNative } from "@/components/ui/select-native";

type Item = { id: string; sku: string | null; name: string; unitName: string };
type Option = { id: string; name: string };
type Location = { id: string; code: string; name: string };
type Invoice = { id: string; number: string; customerId: string };
type Project = { id: string; code: string; name: string; customerId: string | null };

const selectClass =
  "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

export function DeliveryNoteForm({
  businessId,
  deliveryId,
  status = "draft",
  customers,
  locations,
  items,
  invoices,
  projects,
  initial,
}: {
  businessId: string;
  deliveryId?: string;
  status?: InventoryDocumentStatus;
  customers: Option[];
  locations: Location[];
  items: Item[];
  invoices: Invoice[];
  projects: Project[];
  initial: DeliveryNoteInput;
}) {
  const [serverError, setServerError] = useState("");
  const [showProjects, setShowProjects] = useState(() =>
    initial.lines.some((line) => Boolean(line.projectId)),
  );
  const form = useForm<DeliveryNoteInput>({
    resolver: zodResolver(deliveryNoteInputSchema),
    defaultValues: initial,
  });
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { isSubmitting },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const customerId = useWatch({ control, name: "customerId" });
  const availableProjects = projects.filter(
    (project) => !project.customerId || project.customerId === customerId,
  );

  async function save(values: DeliveryNoteInput, intent: "draft" | "post") {
    setServerError("");
    const result = await saveDeliveryNoteAction(
      businessId,
      deliveryId ?? null,
      values,
      intent,
    );
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof DeliveryNoteInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }

  function selectItem(index: number, id: string) {
    const item = items.find((entry) => entry.id === id);
    if (item) setValue(`lines.${index}.description`, item.name);
  }

  return (
    <form className="space-y-7" noValidate>
      {serverError && (
        <FormError message={serverError} />
      )}

      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Delivery details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Posting reduces stock and records Cost of Sales. It does not create Accounts
          Receivable.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="customerId">Customer</Label>
            <SelectNative id="customerId"  {...register("customerId")}>
              <option value="">Choose a customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Delivery date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationId">Location</Label>
            <SelectNative id="locationId"  {...register("locationId")}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salesInvoiceId">
              Sales Invoice <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <SelectNative
              id="salesInvoiceId"
              
              {...register("salesInvoiceId")}
            >
              <option value="">No linked invoice</option>
              {invoices
                .filter((invoice) => !customerId || invoice.customerId === customerId)
                .map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number}
                  </option>
                ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <SelectNative id="projectId"  {...register("projectId")}>
              <option value="">No project</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label htmlFor="notes">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="notes" {...register("notes")} />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Items delivered</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Available stock is validated inside the posting transaction.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowProjects((value) => !value)}
            >
              <Columns3 className="size-4" />
              {showProjects ? "Hide line Projects" : "Show Project per line"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                append({
                  itemId: "",
                  description: "",
                  quantity: "1",
                  projectId: "",
                  salesInvoiceLineId: "",
                })
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
          <table className={`data-table ${showProjects ? "min-w-[950px]" : "min-w-[760px]"}`}>
            <thead>
              <tr>
                <th className="w-64">Inventory Item</th>
                <th>Description</th>
                <th className="w-32 text-right!">Quantity</th>
                {showProjects && <th className="w-52">Project override</th>}
                <th className="w-12"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="hover:bg-transparent!">
                  <td>
                    <SelectNative
                      
                      {...register(`lines.${index}.itemId`, {
                        onChange: (event) => selectItem(index, event.target.value),
                      })}
                    >
                      <option value="">Choose item…</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku ? `${item.sku} — ` : ""}{item.name}
                        </option>
                      ))}
                    </SelectNative>
                    <input type="hidden" {...register(`lines.${index}.salesInvoiceLineId`)} />
                  </td>
                  <td><Input {...register(`lines.${index}.description`)} /></td>
                  <td>
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      className="money text-right"
                      {...register(`lines.${index}.quantity`)}
                    />
                  </td>
                  {showProjects && (
                    <td>
                      <SelectNative  {...register(`lines.${index}.projectId`)}>
                        <option value="">Use document Project</option>
                        {availableProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} — {project.name}
                          </option>
                        ))}
                      </SelectNative>
                    </td>
                  )}
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length === 1}
                      title={fields.length === 1 ? "A delivery needs at least one line" : undefined}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x">
        <Button asChild variant="ghost">
          <Link href={deliveryId ? `/b/${businessId}/sales/delivery-notes/${deliveryId}` : `/b/${businessId}/sales/delivery-notes`}>
            Cancel
          </Link>
        </Button>
        {status === "posted" ? (
          <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
            Update Posted Delivery
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>
              Save Draft
            </Button>
            <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
              Post Delivery
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
