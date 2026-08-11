"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomerAction, updateCustomerAction } from "./actions";
import { customerInputSchema, type CustomerInput } from "./customer-input";

type Values = CustomerInput;

export function CustomerForm({ businessId, customerId, currencies, initial }: { businessId: string; customerId?: string; currencies: { code: string; name: string }[]; initial?: Values }) {
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: initial ?? {
      name: "", email: "", phone: "", taxReference: "", legalName: "", trn: "",
      legalRegistrationIdentifier: "", electronicAddress: "", electronicAddressScheme: "",
      addressLine1: "", city: "", countrySubdivision: "", countryCode: "AE", buyerReference: "", defaultCurrencyCode: currencies[0]?.code ?? "AED",
    },
  });
  async function submit(values: Values) {
    setServerError("");
    const result = customerId ? await updateCustomerAction(businessId, customerId, values) : await createCustomerAction(businessId, values);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof Values, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }
  const cancelHref = customerId ? `/b/${businessId}/customers/${customerId}` : `/b/${businessId}/customers`;
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-7" noValidate>
      {serverError && <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{serverError}</div>}
      <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Contact information</h2><p className="mt-1 text-sm text-muted-foreground">Keep the core identity clear; more addresses and custom fields come later.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="name">Customer name</Label><Input id="name" autoFocus {...register("name")} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />{errors.email && <p className="field-error">{errors.email.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" {...register("phone")} /></div>
        <div className="space-y-1.5"><Label htmlFor="taxReference">TRN / reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="taxReference" {...register("taxReference")} /></div>
        <div className="space-y-1.5"><Label htmlFor="defaultCurrencyCode">Default document currency</Label><select id="defaultCurrencyCode" className="h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" {...register("defaultCurrencyCode")}>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></div>
      </div></section>
      <details className="rounded-lg border border-border bg-surface-raised">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Electronic Invoicing details</summary>
        <div className="grid gap-5 border-t border-border p-4 sm:grid-cols-2">
          <p className="text-sm text-muted-foreground sm:col-span-2">Required only when this customer receives a PINT-AE eInvoice. UAE scheme 0235 electronic addresses are 10 digits beginning with 1.</p>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="legalName">Legal name</Label><Input id="legalName" {...register("legalName")} /></div>
          <div className="space-y-1.5"><Label htmlFor="trn">TRN</Label><Input id="trn" inputMode="numeric" {...register("trn")} aria-invalid={!!errors.trn} />{errors.trn && <p className="field-error">{errors.trn.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="legalRegistrationIdentifier">Trade-license identifier</Label><Input id="legalRegistrationIdentifier" {...register("legalRegistrationIdentifier")} /></div>
          <div className="space-y-1.5"><Label htmlFor="electronicAddress">Electronic address</Label><Input id="electronicAddress" inputMode="numeric" {...register("electronicAddress")} /></div>
          <div className="space-y-1.5"><Label htmlFor="electronicAddressScheme">Electronic address scheme</Label><Input id="electronicAddressScheme" placeholder="0235" {...register("electronicAddressScheme")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="addressLine1">Street address</Label><Input id="addressLine1" {...register("addressLine1")} /></div>
          <div className="space-y-1.5"><Label htmlFor="city">City</Label><Input id="city" {...register("city")} /></div>
          <div className="space-y-1.5"><Label htmlFor="countrySubdivision">Emirate code</Label><Input id="countrySubdivision" placeholder="DXB" {...register("countrySubdivision")} /></div>
          <div className="space-y-1.5"><Label htmlFor="countryCode">Country code</Label><Input id="countryCode" placeholder="AE" {...register("countryCode")} /></div>
          <div className="space-y-1.5"><Label htmlFor="buyerReference">Buyer reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="buyerReference" {...register("buyerReference")} /></div>
        </div>
      </details>
      <div className="flex justify-end gap-2"><Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {customerId ? "Save changes" : "Save customer"}</Button></div>
    </form>
  );
}
