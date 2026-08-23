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
import { createSupplierAction, updateSupplierAction } from "./actions";
import { supplierInputSchema, type SupplierInput } from "./supplier-input";

export function SupplierForm({ businessId, supplierId, currencies, initial }: { businessId: string; supplierId?: string; currencies: { code: string; name: string }[]; initial: SupplierInput }) {
  const [serverError, setServerError] = useState("");
  const form = useForm<SupplierInput>({ resolver: zodResolver(supplierInputSchema), defaultValues: initial });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  async function submit(values: SupplierInput) {
    setServerError("");
    const result = supplierId
      ? await updateSupplierAction(businessId, supplierId, values)
      : await createSupplierAction(businessId, values);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof SupplierInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }
  const cancelHref = supplierId ? `/b/${businessId}/suppliers/${supplierId}` : `/b/${businessId}/suppliers`;
  return <form onSubmit={handleSubmit(submit)} className="space-y-7" noValidate>
    {serverError && <FormError message={serverError} />}
    <section className="border-b border-border pb-7">
      <h2 className="text-base font-semibold">Supplier details</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="name">Supplier name</Label><Input id="name" autoFocus {...register("name")} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />{errors.email && <p className="field-error">{errors.email.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="phone" {...register("phone")} /></div>
        <div className="space-y-1.5"><Label htmlFor="taxReference">TRN / tax reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="taxReference" {...register("taxReference")} /></div>
        <div className="space-y-1.5"><Label htmlFor="address">Address <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="address" {...register("address")} /></div>
        <div className="space-y-1.5"><Label htmlFor="defaultCurrencyCode">Default document currency</Label><select id="defaultCurrencyCode" className="h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" {...register("defaultCurrencyCode")}>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></div>
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><textarea id="notes" rows={4} className="w-full rounded-[6px] border border-border-strong bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" {...register("notes")} /></div>
        <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isActive")} /> Active supplier</label>
      </div>
    </section>
    <section className="border-b border-border pb-7">
      <h2 className="text-base font-semibold">Electronic Invoicing</h2>
      <p className="mt-1 text-sm text-muted-foreground">Strong identifiers are used for deterministic inbound PINT-AE Supplier matching. Names alone never auto-confirm a match.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="legalName">Legal name <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="legalName" {...register("legalName")} /></div>
        <div className="space-y-1.5"><Label htmlFor="trn">TRN <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="trn" {...register("trn")} /></div>
        <div className="space-y-1.5"><Label htmlFor="legalRegistrationIdentifier">Legal registration ID <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="legalRegistrationIdentifier" {...register("legalRegistrationIdentifier")} /></div>
        <div className="space-y-1.5"><Label htmlFor="electronicAddress">Electronic address <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="electronicAddress" {...register("electronicAddress")} aria-invalid={!!errors.electronicAddress} />{errors.electronicAddress && <p className="field-error">{errors.electronicAddress.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="electronicAddressScheme">Address scheme <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="electronicAddressScheme" placeholder="0235" {...register("electronicAddressScheme")} aria-invalid={!!errors.electronicAddressScheme} />{errors.electronicAddressScheme && <p className="field-error">{errors.electronicAddressScheme.message}</p>}</div>
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="registeredAddress">Registered address <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="registeredAddress" {...register("registeredAddress")} /></div>
        <div className="space-y-1.5"><Label htmlFor="countryCode">Country code <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="countryCode" maxLength={2} placeholder="AE" {...register("countryCode")} aria-invalid={!!errors.countryCode} />{errors.countryCode && <p className="field-error">{errors.countryCode.message}</p>}</div>
      </div>
    </section>
    <div className="flex justify-end gap-2"><Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {supplierId ? "Save changes" : "Create supplier"}</Button></div>
  </form>;
}
