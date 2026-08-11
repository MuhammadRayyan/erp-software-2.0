import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/core/permissions/require-module";
import { TaxSettingsForm } from "@/modules/tax/tax-settings-form";
import { getTaxSettings } from "@/modules/tax/tax-settings-service";

export default async function TaxSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  const settings = getTaxSettings(businessId, user.id);
  return <div className="page-container max-w-[980px]">
    <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Settings</Link>
    <div className="page-header"><div><div className="flex items-center gap-2"><h1 className="page-title">UAE VAT settings</h1><Badge tone={settings.vatRegistered ? "success" : "neutral"}>{settings.vatRegistered ? "VAT registered" : "Not VAT registered"}</Badge></div><p className="page-description">Business-local registration data and the default Emirate used as a reviewable Sales reporting default.</p></div></div>
    {settings.taxLockDate && <div className="mb-5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">VAT-affecting transactions are locked through <strong>{settings.taxLockDate}</strong>.</div>}
    <TaxSettingsForm businessId={businessId} isAdmin={access.membership.role === "administrator"} initial={{ vatRegistered: settings.vatRegistered, trn: settings.trn ?? "", vatRegistrationEffectiveDate: settings.vatRegistrationEffectiveDate ?? "", vatDeregistrationDate: settings.vatDeregistrationDate ?? "", defaultSupplyEmirate: settings.defaultSupplyEmirate as "" | "abu_dhabi" | "dubai" | "sharjah" | "ajman" | "umm_al_quwain" | "ras_al_khaimah" | "fujairah" }} />
  </div>;
}

