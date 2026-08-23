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
import { saveInventoryLocationAction } from "./actions";
import { inventoryLocationInputSchema, type InventoryLocationInput } from "./inventory-location-input";

export function InventoryLocationForm({ businessId, locationId, initial }: { businessId: string; locationId?: string; initial: InventoryLocationInput }) {
  const [serverError, setServerError] = useState("");
  const form = useForm<InventoryLocationInput>({ resolver: zodResolver(inventoryLocationInputSchema), defaultValues: initial });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  async function save(values: InventoryLocationInput) { setServerError(""); const result = await saveInventoryLocationAction(businessId, locationId ?? null, values); if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof InventoryLocationInput, { message: messages[0] }); if (result.error) setServerError(result.error); }
  return <form onSubmit={handleSubmit(save)} className="max-w-3xl space-y-7" noValidate>{serverError && <FormError message={serverError} />}<section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Location details</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="code">Code</Label><Input id="code" {...register("code")} aria-invalid={!!errors.code} />{errors.code && <p className="field-error">{errors.code.message}</p>}</div><div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" {...register("name")} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name.message}</p>}</div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="address">Address <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="address" {...register("address")} /></div></div></section><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isDefault")} /> Default location</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isActive")} /> Active</label></div><div className="flex justify-between border-t border-border pt-4"><Button asChild variant="ghost"><Link href={locationId ? `/b/${businessId}/inventory/locations/${locationId}` : `/b/${businessId}/inventory/locations`}>Cancel</Link></Button><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {locationId ? "Save Changes" : "Create Location"}</Button></div></form>;
}
