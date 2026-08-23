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
import { businessInputSchema, type BusinessInput } from "@/core/businesses/business-input";
import { createBusinessAction } from "../actions";
import { SelectNative } from "@/components/ui/select-native";

type Values = BusinessInput;

export function BusinessForm() {
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(businessInputSchema),
    defaultValues: { name: "", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 },
  });

  async function submit(values: Values) {
    setServerError("");
    const result = await createBusinessAction(values);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof Values, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-7" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Business details</h2><p className="mt-1 text-sm text-muted-foreground">A dedicated SQLite database and attachments directory will be created for this business.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="name">Business name</Label><Input id="name" autoFocus {...register("name")} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="country">Country</Label><SelectNative id="country"  {...register("country")}><option>United Arab Emirates</option><option>Saudi Arabia</option><option>Oman</option><option>Qatar</option><option>Bahrain</option><option>Kuwait</option></SelectNative></div>
          <div className="space-y-1.5"><Label htmlFor="currency">Currency</Label><SelectNative id="currency"  {...register("currency")}><option value="AED">AED — UAE Dirham</option><option value="SAR">SAR — Saudi Riyal</option><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option></SelectNative>{errors.currency && <p className="field-error">{errors.currency.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="financialYearStartMonth">Financial year starts</Label><SelectNative id="financialYearStartMonth"  {...register("financialYearStartMonth", { valueAsNumber: true })}>{["January","February","March","April","May","June","July","August","September","October","November","December"].map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</SelectNative></div>
        </div>
      </section>
      <div className="flex justify-end gap-2"><Button asChild variant="ghost"><Link href="/businesses">Cancel</Link></Button><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Create business</Button></div>
    </form>
  );
}
