"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Columns3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveGoodsReceiptAction } from "./goods-receipt-actions";
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

const selectClass =
  "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

export function GoodsReceiptForm({
  businessId,
  receiptId,
  status = "draft",
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
    formState: { errors, isSubmitting },
  } = form;
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
    setValue(`lines.${index}.description`, item.name);
    setValue(
      `lines.${index}.unitCost`,
      item.purchasePriceMinor == null ? "0.00" : (item.purchasePriceMinor / 100).toFixed(2),
    );
  }

  return (
    <form className="space-y-7" noValidate>
      {serverError && (
        <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {serverError}
        </div>
      )}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Receipt details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Posting increases physical stock only. It does not create Accounts Payable.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <select id="supplierId" className={selectClass} {...register("supplierId")}>
              <option value="">Choose a supplier…</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            {errors.supplierId && <p className="field-error">{errors.supplierId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Receipt date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationId">Location</Label>
            <select id="locationId" className={selectClass} {...register("locationId")}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchaseOrderId">
              Purchase Order <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <select id="purchaseOrderId" className={selectClass} {...register("purchaseOrderId")}>
              <option value="">No linked order</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>{order.number}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchaseInvoiceId">
              Purchase Invoice <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <select id="purchaseInvoiceId" className={selectClass} {...register("purchaseInvoiceId")}>
              <option value="">No linked invoice</option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.number}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <select id="projectId" className={selectClass} {...register("projectId")}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
              ))}
            </select>
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
            <Input id="notes" {...register("notes")} />
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
          <table className={`data-table ${showProjects ? "min-w-[1050px]" : "min-w-[850px]"}`}>
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
                    <select
                      className={selectClass}
                      aria-label={`Line ${index + 1} item`}
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
                    </select>
                    <input type="hidden" {...register(`lines.${index}.purchaseOrderLineId`)} />
                    <input type="hidden" {...register(`lines.${index}.purchaseInvoiceLineId`)} />
                  </td>
                  <td><Input aria-label={`Line ${index + 1} description`} {...register(`lines.${index}.description`)} /></td>
                  <td><Input className="money text-right" type="number" min="0.0001" step="0.0001" {...register(`lines.${index}.quantity`)} /></td>
                  <td><Input className="money text-right" type="number" min="0" step="0.01" {...register(`lines.${index}.unitCost`)} /></td>
                  {showProjects && (
                    <td>
                      <select className={selectClass} {...register(`lines.${index}.projectId`)}>
                        <option value="">Use document Project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
                        ))}
                      </select>
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
          <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
            Update Posted Receipt
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>
              Save Draft
            </Button>
            <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
              Post Receipt
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
