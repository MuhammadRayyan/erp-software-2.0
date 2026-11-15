"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Columns3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { saveGoodsReceiptAction } from "./goods-receipt-actions";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  goodsReceiptInputSchema,
  type GoodsReceiptInput,
} from "./goods-receipt-input";
import type { InventoryDocumentStatus } from "./inventory-document";

type ItemOption = {
  id: string;
  sku: string | null;
  name: string;
  unitName: string;
  purchasePriceMinor: number | null;
};
type Option = { id: string; name: string };
type Location = { id: string; code: string; name: string };
type Source = { id: string; number: string; supplierId: string };
type Project = { id: string; code: string; name: string };


export function GoodsReceiptForm({
  businessId,
  receiptId,
  status = "draft",
  baseMinorUnit,
  suppliers,
  locations,
  items,
  orders,
  invoices,
  projects,
  initial,
}: {
  businessId: string;
  receiptId?: string;
  status?: InventoryDocumentStatus;
  baseMinorUnit: number;
  suppliers: Option[];
  locations: Location[];
  items: ItemOption[];
  orders: Source[];
  invoices: Source[];
  projects: Project[];
  initial: GoodsReceiptInput;
}) {
  const [serverError, setServerError] = useState("");
  const [showProjects, setShowProjects] = useState(() =>
    initial.lines.some((line) => Boolean(line.projectId)),
  );
  const form = useForm<GoodsReceiptInput>({
    resolver: zodResolver(goodsReceiptInputSchema),
    defaultValues: initial,
  });
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  async function save(values: GoodsReceiptInput, intent: "draft" | "post") {
    setServerError("");
    const result = await saveGoodsReceiptAction(
      businessId,
      receiptId ?? null,
      values,
      intent,
    );
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof GoodsReceiptInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }

  function selectItem(index: number, itemId: string) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    setValue(`lines.${index}.description`, item.name, { shouldDirty: true, shouldTouch: true });
    setValue(
      `lines.${index}.unitCost`,
      minorToCurrencyInput(item.purchasePriceMinor ?? 0, baseMinorUnit),
      { shouldDirty: true, shouldTouch: true },
    );
  }

  return (
    <form className="space-y-7 max-w-none" noValidate>
      {serverError && (
        <FormError message={serverError} />
      )}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Receipt details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Posting increases physical stock only. It does not create Accounts Payable.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <Controller
              control={control}
              name="supplierId"
              render={({ field }) => (
                <Combobox
                  id="supplierId"
                  options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  allowClear
                  clearLabel="No supplier"
                  placeholder="Choose a supplier…"
                  searchPlaceholder="Search suppliers…"
                  emptyText="No suppliers found."
                  ariaInvalid={!!errors.supplierId}
                />
              )}
            />
            {errors.supplierId && <p className="field-error">{errors.supplierId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Receipt date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationId">Location</Label>
            <Controller
              control={control}
              name="locationId"
              render={({ field }) => (
                <Combobox
                  id="locationId"
                  options={locations.map((location) => ({
                    value: location.id,
                    label: `${location.code} — ${location.name}`,
                  }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  placeholder="Choose location…"
                  searchPlaceholder="Search locations…"
                  emptyText="No locations found."
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchaseOrderId">
              Purchase Order <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="purchaseOrderId"
              render={({ field }) => (
                <Combobox
                  id="purchaseOrderId"
                  options={orders.map((order) => ({ value: order.id, label: order.number }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  allowClear
                  clearLabel="No linked order"
                  placeholder="No linked order"
                  searchPlaceholder="Search orders…"
                  emptyText="No purchase orders found."
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchaseInvoiceId">
              Purchase Invoice <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="purchaseInvoiceId"
              render={({ field }) => (
                <Combobox
                  id="purchaseInvoiceId"
                  options={invoices.map((invoice) => ({ value: invoice.id, label: invoice.number }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  allowClear
                  clearLabel="No linked invoice"
                  placeholder="No linked invoice"
                  searchPlaceholder="Search invoices…"
                  emptyText="No purchase invoices found."
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <Combobox
                  id="projectId"
                  options={projects.map((project) => ({
                    value: project.id,
                    label: `${project.code} — ${project.name}`,
                  }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  allowClear
                  clearLabel="No project"
                  placeholder="No project"
                  searchPlaceholder="Search projects…"
                  emptyText="No projects found."
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notes">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="notes" rows={2} placeholder="Receiving and storage notes..." {...register("notes")} />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Items received</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Unit cost updates moving-average valuation; linked PO quantities cannot be exceeded.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowProjects((value) => !value)}>
              <Columns3 className="size-4" />
              {showProjects ? "Hide line Projects" : "Show Project per line"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({
                itemId: "",
                description: "",
                quantity: "1",
                unitCost: "0.00",
                projectId: "",
                purchaseOrderLineId: "",
                purchaseInvoiceLineId: "",
              })}
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="w-64">Inventory Item</th>
                <th>Description</th>
                <th className="w-28 text-right!">Quantity</th>
                <th className="w-36 text-right!">Unit Cost</th>
                {showProjects && <th className="w-52">Project override</th>}
                <th className="w-12"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="hover:bg-transparent!">
                  <td>
                    <Controller
                      control={control}
                      name={`lines.${index}.itemId`}
                      render={({ field: itemField }) => (
                        <Combobox
                          size="sm"
                          ariaLabel={`Line ${index + 1} item`}
                          options={items.map((item) => ({
                            value: item.id,
                            label: `${item.sku ? `${item.sku} — ` : ""}${item.name}`,
                          }))}
                          value={itemField.value ?? ""}
                          onValueChange={(next) => {
                            itemField.onChange(next);
                            selectItem(index, next);
                          }}
                          allowClear
                          clearLabel="Clear item"
                          placeholder="Choose item…"
                          searchPlaceholder="Search items…"
                          emptyText="No items found."
                        />
                      )}
                    />
                    <input type="hidden" {...register(`lines.${index}.purchaseOrderLineId`)} />
                    <input type="hidden" {...register(`lines.${index}.purchaseInvoiceLineId`)} />
                  </td>
                  <td><Input aria-label={`Line ${index + 1} description`} {...register(`lines.${index}.description`)} /></td>
                  <td><Input aria-label={`Line ${index + 1} quantity`} className="money text-right" type="number" min="0.0001" step="0.0001" {...register(`lines.${index}.quantity`)} /></td>
                  <td><Input aria-label={`Line ${index + 1} unit cost`} className="money text-right" type="number" min="0" step="0.01" {...register(`lines.${index}.unitCost`)} /></td>
                  {showProjects && (
                    <td>
                      <Controller
                        control={control}
                        name={`lines.${index}.projectId`}
                        render={({ field: projField }) => (
                          <Combobox
                            size="sm"
                            ariaLabel={`Line ${index + 1} project`}
                            options={projects.map((project) => ({
                              value: project.id,
                              label: `${project.code} — ${project.name}`,
                            }))}
                            value={projField.value ?? ""}
                            onValueChange={projField.onChange}
                            allowClear
                            clearLabel="Use document Project"
                            placeholder="Use document Project"
                            searchPlaceholder="Search projects…"
                            emptyText="No projects found."
                          />
                        )}
                      />
                    </td>
                  )}
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length === 1}
                      title={fields.length === 1 ? "A receipt needs at least one line" : undefined}
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
          <Link href={receiptId ? `/b/${businessId}/purchases/goods-receipts/${receiptId}` : `/b/${businessId}/purchases/goods-receipts`}>
            Cancel
          </Link>
        </Button>
        {status === "posted" ? (
          <Button permission={["save", "post"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
            Update Posted Receipt
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button permission={"save"} type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>
              Save Draft
            </Button>
            <Button permission={["save", "post"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
              Post Receipt
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
