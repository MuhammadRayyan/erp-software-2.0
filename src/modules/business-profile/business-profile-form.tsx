"use client";

import { useState } from "react";
import { Building2, Mail, MapPin, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { updateBusinessProfileAction } from "./actions";
import type { BusinessProfileInput } from "./business-profile-input";
import type { ResolvedBusinessProfile } from "./business-profile-service";

const UAE_EMIRATES = [
  { value: "Dubai", label: "Dubai" },
  { value: "Abu Dhabi", label: "Abu Dhabi" },
  { value: "Sharjah", label: "Sharjah" },
  { value: "Ajman", label: "Ajman" },
  { value: "Ras Al Khaimah", label: "Ras Al Khaimah" },
  { value: "Fujairah", label: "Fujairah" },
  { value: "Umm Al Quwain", label: "Umm Al Quwain" },
];

export function BusinessProfileForm({
  businessId,
  initial,
  isAdmin,
}: {
  businessId: string;
  initial: ResolvedBusinessProfile;
  isAdmin: boolean;
}) {
  const [values, setValues] = useState<BusinessProfileInput>({
    legalName: initial.legalName ?? "",
    tradingName: initial.tradingName ?? "",
    companyRegistrationNumber: initial.companyRegistrationNumber ?? "",
    taxId: initial.taxId ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    website: initial.website ?? "",
    addressLine1: initial.addressLine1 ?? "",
    addressLine2: initial.addressLine2 ?? "",
    city: initial.city ?? "",
    stateOrEmirate: initial.stateOrEmirate ?? "",
    postalCode: initial.postalCode ?? "",
    country: initial.country ?? "United Arab Emirates",
    countryCode: initial.countryCode ?? "AE",
    logoUrl: initial.logoUrl ?? "",
  });

  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;

    setPending(true);
    setServerError("");

    const res = await updateBusinessProfileAction(businessId, values);
    setPending(false);

    if (res.error) {
      setServerError(res.error);
      toast.error(res.error);
    } else {
      toast.success("Business profile and organization branding updated.");
    }
  }

  const displayName = values.tradingName || values.legalName || "Your Company";

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {/* Live Letterhead Preview Card */}
      <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Live Document Letterhead Preview
        </span>
        <div className="mt-3 flex flex-col justify-between gap-4 border-t border-border pt-4 sm:flex-row sm:items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {values.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={values.logoUrl}
                  alt={displayName}
                  className="h-10 max-w-[140px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary font-bold">
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-foreground">{displayName}</h3>
                {values.legalName && values.legalName !== values.tradingName && (
                  <p className="text-xs text-muted-foreground">{values.legalName}</p>
                )}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
              {(values.addressLine1 || values.city) && (
                <p>
                  {[values.addressLine1, values.addressLine2, values.city, values.stateOrEmirate, values.postalCode, values.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {values.taxId && <span><strong>TRN:</strong> {values.taxId}</span>}
                {values.companyRegistrationNumber && <span><strong>Reg:</strong> {values.companyRegistrationNumber}</span>}
                {values.email && <span>{values.email}</span>}
                {values.phone && <span>{values.phone}</span>}
                {values.website && <span>{values.website}</span>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block rounded-md bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
              Base Currency: {initial.baseCurrency}
            </span>
          </div>
        </div>
      </div>

      {/* Section 1: Business Identity */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Building2 className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Legal & Brand Identity</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tradingName">Trading / Brand Name</Label>
            <Input
              id="tradingName"
              placeholder="e.g. Acme Global"
              value={values.tradingName}
              onChange={(e) => setValues({ ...values, tradingName: e.target.value })}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">The primary name shown to customers on quotes and invoices.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="legalName">Legal Registered Name</Label>
            <Input
              id="legalName"
              placeholder="e.g. Acme Trading FZ-LLC"
              value={values.legalName}
              onChange={(e) => setValues({ ...values, legalName: e.target.value })}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">Full statutory legal entity name registered with government authorities.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxId">Tax Registration Number (TRN / VAT ID)</Label>
            <Input
              id="taxId"
              placeholder="e.g. 100234567800003"
              value={values.taxId}
              onChange={(e) => setValues({ ...values, taxId: e.target.value })}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">Synchronized with UAE VAT settings and displayed on tax invoices.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="companyRegistrationNumber">Trade License / Registration Number</Label>
            <Input
              id="companyRegistrationNumber"
              placeholder="e.g. CN-1234567"
              value={values.companyRegistrationNumber}
              onChange={(e) => setValues({ ...values, companyRegistrationNumber: e.target.value })}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">Commercial license or registration number from the chamber / DED.</p>
          </div>
        </div>
      </section>

      {/* Section 2: Contact Information */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Mail className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Contact Information</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Official Business Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="billing@example.com"
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+971 4 123 4567"
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Website URL</Label>
            <Input
              id="website"
              placeholder="https://example.com"
              value={values.website}
              onChange={(e) => setValues({ ...values, website: e.target.value })}
              disabled={!isAdmin}
            />
          </div>
        </div>
      </section>

      {/* Section 3: Registered Address */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <MapPin className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Registered Address</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="addressLine1">Address Line 1</Label>
            <Input
              id="addressLine1"
              placeholder="Building, Suite, Street name"
              value={values.addressLine1}
              onChange={(e) => setValues({ ...values, addressLine1: e.target.value })}
              disabled={!isAdmin}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
            <Input
              id="addressLine2"
              placeholder="Floor, Area, Landmark"
              value={values.addressLine2}
              onChange={(e) => setValues({ ...values, addressLine2: e.target.value })}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              placeholder="e.g. Dubai"
              value={values.city}
              onChange={(e) => setValues({ ...values, city: e.target.value })}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stateOrEmirate">Emirate / State / Province</Label>
            <Input
              id="stateOrEmirate"
              list="emirates-list"
              placeholder="e.g. Dubai"
              value={values.stateOrEmirate}
              onChange={(e) => setValues({ ...values, stateOrEmirate: e.target.value })}
              disabled={!isAdmin}
            />
            <datalist id="emirates-list">
              {UAE_EMIRATES.map((e) => (
                <option key={e.value} value={e.value} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="postalCode">Postal Code / P.O. Box</Label>
            <Input
              id="postalCode"
              placeholder="e.g. P.O. Box 12345"
              value={values.postalCode}
              onChange={(e) => setValues({ ...values, postalCode: e.target.value })}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={values.country}
              onChange={(e) => setValues({ ...values, country: e.target.value })}
              disabled={!isAdmin}
            />
          </div>
        </div>
      </section>

      {/* Section 4: Branding & Logo */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ImageIcon className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Branding & Logo URL</h2>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logoUrl">Company Logo URL</Label>
          <Input
            id="logoUrl"
            type="url"
            placeholder="https://example.com/logo.png"
            value={values.logoUrl}
            onChange={(e) => setValues({ ...values, logoUrl: e.target.value })}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted-foreground">
            Direct image link (PNG, JPG, or SVG) used on generated PDFs, print headers, and document templates.
          </p>
        </div>
      </section>

      {serverError && <FormError message={serverError} />}

      {isAdmin && (
        <div className="flex justify-end gap-3 pt-2">
          <Button permission={"save"} type="submit" disabled={pending}>
            {pending && <LoaderCircle className="size-4 animate-spin mr-1.5" />}
            Save Business Profile
          </Button>
        </div>
      )}
    </form>
  );
}
