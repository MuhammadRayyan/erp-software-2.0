import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/core/permissions/require-module";
import { TaxSettingsForm } from "@/modules/tax/tax-settings-form";
import { getTaxSettings } from "@/modules/tax/tax-settings-service";
import { SettingsShell } from "@/components/settings-shell";

export default async function TaxSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  const settings = getTaxSettings(businessId, user.id);
  
  const titleNode = (
    <div className="flex items-center gap-2">
      UAE VAT settings
      <Badge tone={settings.vatRegistered ? "success" : "neutral"}>{settings.vatRegistered ? "VAT registered" : "Not VAT registered"}</Badge>
    </div>
  );
  
  return (
    <SettingsShell businessId={businessId} title={titleNode as unknown as string} description="Business-local registration data and the default Emirate used as a reviewable Sales reporting default.">
      {settings.taxLockDate && <div className="mb-5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">VAT-affecting transactions are locked through <strong>{settings.taxLockDate}</strong>.</div>}
      <TaxSettingsForm businessId={businessId} isAdmin={access.membership.role === "administrator"} initial={{ vatRegistered: settings.vatRegistered, trn: settings.trn ?? "", vatRegistrationEffectiveDate: settings.vatRegistrationEffectiveDate ?? "", vatDeregistrationDate: settings.vatDeregistrationDate ?? "", defaultSupplyEmirate: settings.defaultSupplyEmirate as "" | "abu_dhabi" | "dubai" | "sharjah" | "ajman" | "umm_al_quwain" | "ras_al_khaimah" | "fujairah" }} />
    </SettingsShell>
  );
}
