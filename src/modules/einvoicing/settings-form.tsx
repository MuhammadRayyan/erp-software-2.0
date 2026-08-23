"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEInvoiceSettingsAction } from "./actions";
import { eInvoiceSettingsInputSchema, type EInvoiceSettingsInput } from "./settings-input";
import { SelectNative } from "@/components/ui/select-native";


export function EInvoiceSettingsForm({ businessId, trn, vatRegistered, initial }: { businessId: string; trn: string; vatRegistered: boolean; initial: EInvoiceSettingsInput }) {
  const [serverError, setServerError] = useState("");
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, setError, control, formState: { errors, isSubmitting } } = useForm<EInvoiceSettingsInput>({ resolver: zodResolver(eInvoiceSettingsInputSchema), defaultValues: initial });
  const environment = useWatch({ control, name: "aspEnvironment" });
  async function submit(values: EInvoiceSettingsInput) {
    setServerError(""); setSaved(false);
    const result = await saveEInvoiceSettingsAction(businessId, values);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof EInvoiceSettingsInput, { message: messages[0] });
    if (result.error) setServerError(result.error); else setSaved(true);
  }
  return <form onSubmit={handleSubmit(submit)} className="space-y-7" noValidate>
    {serverError && <FormError message={serverError} />}
    {saved && <div role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2.5 text-sm text-success">Electronic Invoicing settings saved.</div>}
    <section className="border-b border-border pb-7"><div className="flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold">Readiness</h2><p className="mt-1 text-sm text-muted-foreground">The seller TRN remains authoritative in Phase 6 VAT settings.</p></div><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" {...register("enabled")} /> Enabled</label></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="space-y-1.5"><Label>Phase 6 VAT registration</Label><Input value={vatRegistered ? "VAT registered" : "Not registered"} readOnly /></div><div className="space-y-1.5"><Label>Phase 6 TRN</Label><Input value={trn || "Not configured"} readOnly /><Link className="text-xs text-primary hover:underline" href={`/b/${businessId}/settings/tax`}>Edit in UAE VAT settings</Link></div></div></section>
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Seller legal identity</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="legalName">Legal name</Label><Input id="legalName" {...register("legalName")} /></div><div className="space-y-1.5"><Label htmlFor="legalRegistrationIdentifier">Trade-license identifier</Label><Input id="legalRegistrationIdentifier" {...register("legalRegistrationIdentifier")} /></div><div className="space-y-1.5"><Label htmlFor="participantIdentifier">Participant identifier <span className="font-normal text-muted-foreground">(reserved)</span></Label><Input id="participantIdentifier" {...register("participantIdentifier")} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="addressLine1">Street address</Label><Input id="addressLine1" {...register("addressLine1")} /></div><div className="space-y-1.5"><Label htmlFor="city">City</Label><Input id="city" {...register("city")} /></div><div className="space-y-1.5"><Label htmlFor="countrySubdivision">Emirate code</Label><Input id="countrySubdivision" placeholder="DXB" {...register("countrySubdivision")} /></div><div className="space-y-1.5"><Label htmlFor="countryCode">Country code</Label><Input id="countryCode" {...register("countryCode")} /></div></div></section>
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Electronic address</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="endpointIdentifier">Endpoint identifier</Label><Input id="endpointIdentifier" {...register("endpointIdentifier")} /><p className="text-xs text-muted-foreground">For scheme 0235: 10 digits beginning with 1.</p></div><div className="space-y-1.5"><Label htmlFor="endpointIdentifierScheme">Endpoint scheme</Label><Input id="endpointIdentifierScheme" placeholder="0235" {...register("endpointIdentifierScheme")} /></div><div className="space-y-1.5"><Label htmlFor="participantIdentifierScheme">Participant scheme <span className="font-normal text-muted-foreground">(reserved)</span></Label><Input id="participantIdentifierScheme" {...register("participantIdentifierScheme")} /></div></div></section>
    <section><h2 className="text-base font-semibold">ASP connection</h2><p className="mt-1 text-sm text-muted-foreground">The provider-neutral boundary supports outbound submission and inbound supplier-document normalization; only the local Mock adapter is executable. No credentials are stored in the business database.</p><div className="mt-5 grid gap-5 sm:grid-cols-3"><div className="space-y-1.5"><Label htmlFor="aspEnvironment">Environment</Label><SelectNative id="aspEnvironment"  {...register("aspEnvironment")}><option value="disabled">Disabled</option><option value="mock">Mock</option></SelectNative></div><div className="space-y-1.5"><Label htmlFor="aspProviderKey">Provider</Label><SelectNative id="aspProviderKey"  {...register("aspProviderKey")}><option value="">None</option><option value="mock">Mock ASP</option></SelectNative>{errors.aspProviderKey && <p className="field-error">{errors.aspProviderKey.message}</p>}</div><div className="space-y-1.5"><Label htmlFor="specificationVersion">PINT-AE version</Label><Input id="specificationVersion" readOnly {...register("specificationVersion")} /></div></div>{environment === "mock" && <p className="mt-3 text-xs text-muted-foreground">Mock inbound and outbound results are explicitly labelled and are not transmitted outside this application.</p>}</section>
    <div className="flex justify-end"><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Save settings</Button></div>
  </form>;
}
