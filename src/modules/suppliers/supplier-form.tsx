"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import { CustomFieldInputs, type CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";
import {
  buildInitialCustomFieldValues,
  firstMissingRequiredCustomField,
  haveCustomFieldValuesChanged,
} from "@/modules/custom-fields/custom-field-display";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { createSupplierAction, updateSupplierAction } from "./actions";
import { supplierInputSchema, type SupplierInput } from "./supplier-input";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

export function SupplierForm({ businessId, supplierId, currencies, initial, customFields = [], customFieldValues }: { businessId: string; supplierId?: string; currencies: { code: string; name: string }[]; initial: SupplierInput; customFields?: CustomFieldInputDefinition[]; customFieldValues?: Record<string, string> }) {
  const [serverError, setServerError] = useState("");
  const initialCustomValues = useMemo(
    () => buildInitialCustomFieldValues(customFields, customFieldValues),
    [customFields, customFieldValues],
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>(initialCustomValues);
  const form = useForm<SupplierInput>({
    resolver: zodResolver(supplierInputSchema),
    // Validate on submit, then live as the user corrects fields. Blur validation
    // inserted error text that shifted the Save button mid-click.
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: initial,
  });
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting, isDirty, isSubmitSuccessful } } = form;
  const customDirty = haveCustomFieldValuesChanged(initialCustomValues, customValues);
  useUnsavedChanges((isDirty || customDirty) && !isSubmitSuccessful);
  async function submit(values: SupplierInput) {
    setServerError("");
    const missingCustomField = firstMissingRequiredCustomField(customFields, customValues);
    if (missingCustomField) {
      setServerError(`"${missingCustomField}" is required.`);
      return;
    }
    const result = supplierId
      ? await updateSupplierAction(businessId, supplierId, values, customValues)
      : await createSupplierAction(businessId, values, customValues);
    if (result.fieldErrors) applyServerFieldErrors(setError, result.fieldErrors);
    if (result.error) setServerError(result.error);
  }
  const cancelHref = supplierId ? `/b/${businessId}/suppliers/${supplierId}` : `/b/${businessId}/suppliers`;
  return <form onSubmit={handleSubmit(submit, focusFirstInvalidField)} className="space-y-7" noValidate>
    {serverError && <FormError message={serverError} />}
    <section className="border-b border-border pb-7">
      <h2 className="text-base font-semibold">Supplier details</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="name">Supplier name</Label><Input id="name" autoFocus {...register("name")} {...fieldErrorProps("name", errors.name)} /><FieldError name="name" message={errors.name?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="email" type="email" {...register("email")} {...fieldErrorProps("email", errors.email)} /><FieldError name="email" message={errors.email?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="phone" type="tel" placeholder="+971 50 123 4567" {...register("phone")} {...fieldErrorProps("phone", errors.phone)} /><FieldError name="phone" message={errors.phone?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="taxReference">TRN / tax reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="taxReference" {...register("taxReference")} {...fieldErrorProps("taxReference", errors.taxReference)} /><FieldError name="taxReference" message={errors.taxReference?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="address">Address <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="address" {...register("address")} {...fieldErrorProps("address", errors.address)} /><FieldError name="address" message={errors.address?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="defaultCurrencyCode">Default document currency</Label><SelectNative id="defaultCurrencyCode" {...register("defaultCurrencyCode")}>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</SelectNative></div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentTermsDays">Payment terms (days) <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="paymentTermsDays" type="number" min={0} max={365} placeholder="0" {...register("paymentTermsDays")} {...fieldErrorProps("paymentTermsDays", errors.paymentTermsDays)} />
          <FieldError name="paymentTermsDays" message={errors.paymentTermsDays?.message} />
        </div>
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="notes" rows={4} {...register("notes")} {...fieldErrorProps("notes", errors.notes)} /><FieldError name="notes" message={errors.notes?.message} /></div>
        <label className="flex min-h-9 items-center gap-2 text-sm cursor-pointer select-none"><Controller control={control} name="isActive" render={({ field }) => <Checkbox checked={Boolean(field.value)} onCheckedChange={(c) => field.onChange(Boolean(c))} aria-label="Active supplier" />} /> Active supplier</label>
      </div>
    </section>
    <details
      open={Boolean(
        initial.legalName ||
          initial.legalRegistrationIdentifier ||
          initial.countryCode ||
          initial.electronicAddress ||
          initial.electronicAddressScheme,
      )}
      className="group border-b border-border pb-7"
    >
      <summary className="cursor-pointer text-base font-semibold text-foreground select-none">
        Legal &amp; E-Invoicing Identifiers <span className="text-xs font-normal text-muted-foreground">(optional)</span>
      </summary>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="legalName">Legal name <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="legalName" {...register("legalName")} {...fieldErrorProps("legalName", errors.legalName)} /><FieldError name="legalName" message={errors.legalName?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="legalRegistrationIdentifier">Legal registration ID <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="legalRegistrationIdentifier" {...register("legalRegistrationIdentifier")} {...fieldErrorProps("legalRegistrationIdentifier", errors.legalRegistrationIdentifier)} /><FieldError name="legalRegistrationIdentifier" message={errors.legalRegistrationIdentifier?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="countryCode">Country code <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="countryCode" maxLength={2} placeholder="AE" {...register("countryCode")} {...fieldErrorProps("countryCode", errors.countryCode)} /><FieldError name="countryCode" message={errors.countryCode?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="electronicAddress">Electronic address <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="electronicAddress" {...register("electronicAddress")} {...fieldErrorProps("electronicAddress", errors.electronicAddress)} /><FieldError name="electronicAddress" message={errors.electronicAddress?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="electronicAddressScheme">Address scheme <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="electronicAddressScheme" placeholder="0235" {...register("electronicAddressScheme")} {...fieldErrorProps("electronicAddressScheme", errors.electronicAddressScheme)} /><FieldError name="electronicAddressScheme" message={errors.electronicAddressScheme?.message} /></div>
      </div>
    </details>
    {customFields.length > 0 && (
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Custom Fields</h2>
        <CustomFieldInputs
          definitions={customFields}
          values={customValues}
          onChange={(definitionId, value) => setCustomValues((current) => ({ ...current, [definitionId]: value }))}
          className="mt-5 grid gap-5 md:grid-cols-2"
          checkboxClassName="size-4 accent-[var(--primary)]"
        />
      </section>
    )}
    <div className="flex justify-end gap-2"><Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button><Button permission={"save"} type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {supplierId ? "Save changes" : "Create supplier"}</Button></div>
  </form>;
}
