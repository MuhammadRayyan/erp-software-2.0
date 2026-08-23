"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveInventoryItemAction } from "./actions";
import { inventoryItemInputSchema, type InventoryItemInput } from "./inventory-item-input";
import { SelectNative } from "@/components/ui/select-native";

type AccountOption = { id: string; code: string; name: string };

export function InventoryItemForm({ businessId, itemId, salesAccounts, assetAccounts, expenseAccounts, initial }: { businessId: string; itemId?: string; salesAccounts: AccountOption[]; assetAccounts: AccountOption[]; expenseAccounts: AccountOption[]; initial: InventoryItemInput }) {
  const [serverError, setServerError] = useState("");
  const form = useForm<InventoryItemInput>({ resolver: zodResolver(inventoryItemInputSchema), defaultValues: initial });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  async function save(values: InventoryItemInput) {
    setServerError("");
    const result = await saveInventoryItemAction(businessId, itemId ?? null, values);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof InventoryItemInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }
  return <form onSubmit={handleSubmit(save)} className="space-y-7" noValidate>
    {serverError && <FormError message={serverError} />}
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Item details</h2><p className="mt-1 text-sm text-muted-foreground">SKU is optional but unique. Quantities are tracked separately at each location.</p><div className="mt-5 grid gap-5 md:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="sku">SKU <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="sku" {...register("sku")} aria-invalid={!!errors.sku} />{errors.sku && <p className="field-error">{errors.sku.message}</p>}</div>
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor="name">Item name</Label><Input id="name" {...register("name")} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="unitName">Unit</Label><Input id="unitName" {...register("unitName")} placeholder="pcs, kg, m" aria-invalid={!!errors.unitName} />{errors.unitName && <p className="field-error">{errors.unitName.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="salesPrice">Sales price <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="salesPrice" inputMode="decimal" {...register("salesPrice")} /></div>
      <div className="space-y-1.5"><Label htmlFor="purchasePrice">Purchase price <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="purchasePrice" inputMode="decimal" {...register("purchasePrice")} /></div>
      <div className="space-y-1.5 md:col-span-3"><Label htmlFor="description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><textarea id="description" rows={3} className="w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 h-auto py-2" {...register("description")} /></div>
    </div></section>
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Accounting</h2><p className="mt-1 text-sm text-muted-foreground">Invoices use Sales and Inventory Asset; Delivery Notes use Cost of Sales and Inventory Asset.</p><div className="mt-5 grid gap-5 md:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="salesAccountId">Sales account</Label><SelectNative id="salesAccountId"  {...register("salesAccountId")}>{salesAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</SelectNative></div>
      <div className="space-y-1.5"><Label htmlFor="inventoryAssetAccountId">Inventory Asset</Label><SelectNative id="inventoryAssetAccountId"  {...register("inventoryAssetAccountId")}>{assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</SelectNative></div>
      <div className="space-y-1.5"><Label htmlFor="costOfSalesAccountId">Cost of Sales</Label><SelectNative id="costOfSalesAccountId"  {...register("costOfSalesAccountId")}>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</SelectNative></div>
    </div></section>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isActive")} /> Active item</label>
    <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x"><Button asChild variant="ghost"><Link href={itemId ? `/b/${businessId}/inventory/items/${itemId}` : `/b/${businessId}/inventory/items`}>Cancel</Link></Button><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {itemId ? "Save Changes" : "Create Item"}</Button></div>
  </form>;
}
