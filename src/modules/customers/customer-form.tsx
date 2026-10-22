"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomFieldInputs, type CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";
import { firstMissingRequiredCustomField } from "@/modules/custom-fields/custom-field-display";
import { createCustomerAction, updateCustomerAction } from "./actions";
import { customerInputSchema, type CustomerInput } from "./customer-input";

type Values = CustomerInput;

export function CustomerForm({
  businessId,
  customerId,
  currencies,
  initial,
  customFields = [],
  customFieldValues,
}: {
  businessId: string;
  customerId?: string;
  currencies: { code: string; name: string }[];
  initial?: Values;
  customFields?: CustomFieldInputDefinition[];
  customFieldValues?: Record<string, string>;
}) {
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    setError,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(customerInputSchema),
    mode: "onTouched",
    defaultValues: initial ?? {
      name: "",
      email: "",
      phone: "",
      taxReference: "",
      legalName: "",
      trn: "",
      legalRegistrationIdentifier: "",
      electronicAddress: "",
      electronicAddressScheme: "",
      addressLine1: "",
      city: "",
      countrySubdivision: "",
      countryCode: "AE",
      buyerReference: "",
      defaultCurrencyCode: currencies[0]?.code ?? "AED",
      paymentTermsDays: 0,
      creditLimitMinor: "",
      billingAddress: "",
      deliveryAddress: "",
      isActive: true,
    },
  });

  const [sameAsBilling, setSameAsBilling] = useState(() => {
    if (!initial) return true;
    return (initial.billingAddress || "") === (initial.deliveryAddress || "");
  });

  const billingAddress = useWatch({ control, name: "billingAddress" });

  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const initialCustomValues: Record<string, string> = {};
    for (const definition of customFields) {
      initialCustomValues[definition.id] =
        customFieldValues?.[definition.id] ?? (definition.fieldType === "checkbox" ? "false" : "");
    }
    return initialCustomValues;
  });

  useEffect(() => {
    if (sameAsBilling) {
      setValue("deliveryAddress", billingAddress || "");
    }
  }, [sameAsBilling, billingAddress, setValue]);

  async function submit(values: Values) {
    setServerError("");
    const missingCustomField = firstMissingRequiredCustomField(customFields, customValues);
    if (missingCustomField) {
      setServerError(`"${missingCustomField}" is required.`);
      return;
    }
    const result = customerId
      ? await updateCustomerAction(businessId, customerId, values, customValues)
      : await createCustomerAction(businessId, values, customValues);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof Values, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }

  const cancelHref = customerId ? `/b/${businessId}/customers/${customerId}` : `/b/${businessId}/customers`;

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-7 max-w-4xl" noValidate>
      {serverError && <FormError message={serverError} />}

      {/* Primary Section: Contact & Billing Information */}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Primary details</h2>
        <p className="mt-1 text-sm text-muted-foreground">Basic contact information and billing address for invoices and receipts.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">
              Customer name <span className="text-destructive">*</span>
            </Label>
            <Input id="name" autoFocus placeholder="e.g. Al Futtaim Trading LLC" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && <p className="field-error">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="email" type="email" placeholder="e.g. accounts@client.ae" {...register("email")} aria-invalid={!!errors.email} />
            {errors.email && <p className="field-error">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="phone" type="tel" placeholder="e.g. +971 4 123 4567" {...register("phone")} aria-invalid={!!errors.phone} />
            {errors.phone && <p className="field-error">{errors.phone.message}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="billingAddress">Billing Address <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="billingAddress"
              rows={3}
              placeholder="Building, street, area, city, P.O. Box..."
              {...register("billingAddress")}
              aria-invalid={!!errors.billingAddress}
            />
            {errors.billingAddress && <p className="field-error">{errors.billingAddress.message}</p>}

            {/* Mini currency selector positioned cleanly right below billing address */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-1 text-xs">
              <Label htmlFor="defaultCurrencyCode" className="text-xs font-medium text-muted-foreground">
                Document Currency:
              </Label>
              <select
                id="defaultCurrencyCode"
                className="h-8 rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs font-semibold text-foreground outline-none transition-colors hover:border-primary focus:border-primary focus:ring-1 focus:ring-ring"
                {...register("defaultCurrencyCode")}
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted-foreground">Default currency applied to new sales documents</span>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
                checked={sameAsBilling}
                onChange={(e) => setSameAsBilling(e.target.checked)}
              />
              Delivery address same as billing address
            </label>
          </div>

          {!sameAsBilling && (
            <div className="space-y-1.5 sm:col-span-2 animate-in fade-in slide-in-from-top-1">
              <Label htmlFor="deliveryAddress">Delivery Address</Label>
              <Textarea
                id="deliveryAddress"
                rows={3}
                placeholder="Warehouse or delivery destination..."
                {...register("deliveryAddress")}
                aria-invalid={!!errors.deliveryAddress}
              />
              {errors.deliveryAddress && <p className="field-error">{errors.deliveryAddress.message}</p>}
            </div>
          )}
        </div>
      </section>

      {/* Additional Options Section */}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Additional options</h2>
        <p className="mt-1 text-sm text-muted-foreground">Optional commercial terms, tax registration, and customer status.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="taxReference">TRN <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="taxReference"
              placeholder="e.g. 100xxxxxxxxxxxx"
              {...register("taxReference")}
              aria-invalid={!!errors.taxReference}
            />
            {errors.taxReference && <p className="field-error">{errors.taxReference.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paymentTermsDays">Payment terms (days) <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="paymentTermsDays"
              type="number"
              min="0"
              max="365"
              placeholder="0 (Due on receipt)"
              {...register("paymentTermsDays")}
              aria-invalid={!!errors.paymentTermsDays}
            />
            {errors.paymentTermsDays && <p className="field-error">{errors.paymentTermsDays.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creditLimitMinor">Credit limit <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="creditLimitMinor"
              type="number"
              min="0"
              placeholder="No limit"
              {...register("creditLimitMinor")}
              aria-invalid={!!errors.creditLimitMinor}
            />
            {errors.creditLimitMinor && <p className="field-error">{errors.creditLimitMinor.message}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2 pt-2">
            <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
                {...register("isActive")}
              />
              Active customer
            </label>
            <p className="text-[13px] text-muted-foreground ml-6">Inactive customers are hidden from standard lists and cannot be used for new invoices.</p>
          </div>
        </div>
      </section>

      {/* Custom Fields Section */}
      {customFields.length > 0 && (
        <section className="border-b border-border pb-7">
          <h2 className="text-base font-semibold">Custom Fields</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fields defined in Settings → Custom Fields.</p>
          <CustomFieldInputs
            definitions={customFields}
            values={customValues}
            onChange={(definitionId, value) => setCustomValues((current) => ({ ...current, [definitionId]: value }))}
            className="mt-5 grid gap-5 sm:grid-cols-2"
            checkboxClassName="size-4 rounded-[4px] border-border-strong accent-primary"
          />
        </section>
      )}

      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
          {customerId ? "Save changes" : "Save customer"}
        </Button>
      </div>
    </form>
  );
}
