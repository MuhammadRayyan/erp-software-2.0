"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { createCustomerAction, updateCustomerAction } from "./actions";
import { customerInputSchema, type CustomerInput } from "./customer-input";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

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
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<Values>({
    resolver: zodResolver(customerInputSchema),
    // Validate on submit, then live as the user corrects fields. Blur validation
    // inserted error text that shifted the Save button mid-click.
    mode: "onSubmit",
    reValidateMode: "onChange",
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

  const initialCustomValues = useMemo(
    () => buildInitialCustomFieldValues(customFields, customFieldValues),
    [customFields, customFieldValues],
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>(initialCustomValues);
  const customDirty = haveCustomFieldValuesChanged(initialCustomValues, customValues);
  useUnsavedChanges((isDirty || customDirty) && !isSubmitSuccessful);

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
      applyServerFieldErrors(setError, result.fieldErrors);
    }
    if (result.error) setServerError(result.error);
  }

  const cancelHref = customerId ? `/b/${businessId}/customers/${customerId}` : `/b/${businessId}/customers`;

  return (
    <form onSubmit={handleSubmit(submit, focusFirstInvalidField)} className="space-y-7 max-w-4xl" noValidate>
      {serverError && <FormError message={serverError} />}

      {/* Primary Section: Contact & Billing Information */}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Primary details</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">
              Customer name <span className="text-destructive">*</span>
            </Label>
            <Input id="name" autoFocus placeholder="e.g. Al Futtaim Trading LLC" {...register("name")} {...fieldErrorProps("name", errors.name)} />
            <FieldError name="name" message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="email" type="email" placeholder="e.g. accounts@client.ae" {...register("email")} {...fieldErrorProps("email", errors.email)} />
            <FieldError name="email" message={errors.email?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="phone" type="tel" placeholder="e.g. +971 4 123 4567" {...register("phone")} {...fieldErrorProps("phone", errors.phone)} />
            <FieldError name="phone" message={errors.phone?.message} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="billingAddress">Billing Address <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="billingAddress"
              rows={3}
              placeholder="Building, street, area, city, P.O. Box..."
              {...register("billingAddress")}
              {...fieldErrorProps("billingAddress", errors.billingAddress)}
            />
            <FieldError name="billingAddress" message={errors.billingAddress?.message} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer select-none">
              <Checkbox
                checked={sameAsBilling}
                onCheckedChange={(checked) => setSameAsBilling(Boolean(checked))}
                aria-label="Delivery address same as billing address"
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
                {...fieldErrorProps("deliveryAddress", errors.deliveryAddress)}
              />
              <FieldError name="deliveryAddress" message={errors.deliveryAddress?.message} />
            </div>
          )}
        </div>
      </section>

      {/* Additional Options Section */}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Additional options</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="taxReference">TRN <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="taxReference"
              placeholder="e.g. 100xxxxxxxxxxxx"
              {...register("taxReference")}
              {...fieldErrorProps("taxReference", errors.taxReference)}
            />
            <FieldError name="taxReference" message={errors.taxReference?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="defaultCurrencyCode">Document Currency</Label>
            <SelectNative
              id="defaultCurrencyCode"
              {...register("defaultCurrencyCode")}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.name}
                </option>
              ))}
            </SelectNative>
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
              {...fieldErrorProps("paymentTermsDays", errors.paymentTermsDays)}
            />
            <FieldError name="paymentTermsDays" message={errors.paymentTermsDays?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creditLimitMinor">Credit limit <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="creditLimitMinor"
              type="number"
              min="0"
              placeholder="No limit"
              {...register("creditLimitMinor")}
              {...fieldErrorProps("creditLimitMinor", errors.creditLimitMinor)}
            />
            <FieldError name="creditLimitMinor" message={errors.creditLimitMinor?.message} />
          </div>

          <div className="space-y-1.5 sm:col-span-2 pt-2">
            <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer select-none">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Checkbox
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                    aria-label="Active customer"
                  />
                )}
              />
              Active customer
            </label>
          </div>
        </div>
      </section>

      {/* Custom Fields Section */}
      {customFields.length > 0 && (
        <section className="border-b border-border pb-7">
          <h2 className="text-base font-semibold">Custom Fields</h2>
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
        <Button permission={"save"} type="submit" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
          {customerId ? "Save changes" : "Save customer"}
        </Button>
      </div>
    </form>
  );
}
