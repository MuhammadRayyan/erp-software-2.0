"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveInventoryItemAction } from "./actions";
import { inventoryItemInputSchema, type InventoryItemInput } from "./inventory-item-input";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, fieldErrorId, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

type AccountOption = { id: string; name: string };

export function InventoryItemForm({ businessId, itemId, salesAccounts, assetAccounts, expenseAccounts, initial }: { businessId: string; itemId?: string; salesAccounts: AccountOption[]; assetAccounts: AccountOption[]; expenseAccounts: AccountOption[]; initial: InventoryItemInput }) {
  const [serverError, setServerError] = useState("");
  const form = useForm<InventoryItemInput>({
    resolver: zodResolver(inventoryItemInputSchema),
    // Validate on submit, then live as the user corrects fields. Blur validation
    // inserted error text that shifted the Save button mid-click.
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: initial,
  });
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting, isDirty, isSubmitSuccessful } } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
  async function save(values: InventoryItemInput) {
    setServerError("");
    const result = await saveInventoryItemAction(businessId, itemId ?? null, values);
    if (result.fieldErrors) applyServerFieldErrors(setError, result.fieldErrors);
    if (result.error) setServerError(result.error);
  }
  return <form onSubmit={handleSubmit(save, focusFirstInvalidField)} className="space-y-7" noValidate>
    {serverError && <FormError message={serverError} />}
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Item details</h2><div className="mt-5 grid gap-5 md:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="sku">SKU <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="sku" {...register("sku")} {...fieldErrorProps("sku", errors.sku)} /><FieldError name="sku" message={errors.sku?.message} /></div>
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor="name">Item name</Label><Input id="name" {...register("name")} {...fieldErrorProps("name", errors.name)} /><FieldError name="name" message={errors.name?.message} /></div>
      <div className="space-y-1.5"><Label htmlFor="unitName">Unit</Label><Input id="unitName" {...register("unitName")} placeholder="pcs, kg, m" {...fieldErrorProps("unitName", errors.unitName)} /><FieldError name="unitName" message={errors.unitName?.message} /></div>
      <div className="space-y-1.5"><Label htmlFor="salesPrice">Sales price <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="salesPrice" inputMode="decimal" {...register("salesPrice")} {...fieldErrorProps("salesPrice", errors.salesPrice)} /><FieldError name="salesPrice" message={errors.salesPrice?.message} /></div>
      <div className="space-y-1.5"><Label htmlFor="purchasePrice">Purchase price <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="purchasePrice" inputMode="decimal" {...register("purchasePrice")} {...fieldErrorProps("purchasePrice", errors.purchasePrice)} /><FieldError name="purchasePrice" message={errors.purchasePrice?.message} /></div>
      <div className="space-y-1.5 md:col-span-3"><Label htmlFor="description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="description" rows={3} {...register("description")} {...fieldErrorProps("description", errors.description)} /><FieldError name="description" message={errors.description?.message} /></div>
    </div></section>
    <section className="form-section"><h2 className="text-base font-semibold">Accounting</h2><div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="salesAccountId">Sales account</Label>
        <Controller
          control={control}
          name="salesAccountId"
          render={({ field }) => (
            <Combobox ref={field.ref}
              id="salesAccountId"
              ariaInvalid={!!errors.salesAccountId} ariaDescribedBy={errors.salesAccountId ? fieldErrorId("salesAccountId") : undefined}
              value={field.value ?? ""}
              onValueChange={field.onChange}
              options={salesAccounts.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Select sales account…"
              searchPlaceholder="Search sales accounts…"
            />
          )}
        />
        <FieldError name="salesAccountId" message={errors.salesAccountId?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inventoryAssetAccountId">Inventory Asset</Label>
        <Controller
          control={control}
          name="inventoryAssetAccountId"
          render={({ field }) => (
            <Combobox ref={field.ref}
              id="inventoryAssetAccountId"
              ariaInvalid={!!errors.inventoryAssetAccountId} ariaDescribedBy={errors.inventoryAssetAccountId ? fieldErrorId("inventoryAssetAccountId") : undefined}
              value={field.value ?? ""}
              onValueChange={field.onChange}
              options={assetAccounts.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Select asset account…"
              searchPlaceholder="Search asset accounts…"
            />
          )}
        />
        <FieldError name="inventoryAssetAccountId" message={errors.inventoryAssetAccountId?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="costOfSalesAccountId">Cost of Sales</Label>
        <Controller
          control={control}
          name="costOfSalesAccountId"
          render={({ field }) => (
            <Combobox ref={field.ref}
              id="costOfSalesAccountId"
              ariaInvalid={!!errors.costOfSalesAccountId} ariaDescribedBy={errors.costOfSalesAccountId ? fieldErrorId("costOfSalesAccountId") : undefined}
              value={field.value ?? ""}
              onValueChange={field.onChange}
              options={expenseAccounts.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Select expense account…"
              searchPlaceholder="Search expense accounts…"
            />
          )}
        />
        <FieldError name="costOfSalesAccountId" message={errors.costOfSalesAccountId?.message} />
      </div>
    </div></section>
    <Controller
      control={control}
      name="isActive"
      render={({ field }) => (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => field.onChange(Boolean(checked))}
          />
          <span>Active item</span>
        </label>
      )}
    />
    <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x"><Button asChild variant="ghost"><Link href={itemId ? `/b/${businessId}/inventory/items/${itemId}` : `/b/${businessId}/inventory/items`}>Cancel</Link></Button><Button permission={"save"} type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {itemId ? "Save Changes" : "Create Item"}</Button></div>
  </form>;
}
