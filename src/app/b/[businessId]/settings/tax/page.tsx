import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    <div className="flex items-center gap-3">
      <span>UAE VAT Settings</span>
      <Badge tone={settings.vatRegistered ? "success" : "neutral"} className="text-xs">
        {settings.vatRegistered ? "VAT registered" : "Not VAT registered"}
      </Badge>
    </div>
  );
  
  return (
    <SettingsShell
      businessId={businessId}
      title={titleNode}
      description="Business-local registration data and the default Emirate used as a reviewable Sales reporting default."
      actions={
        <Link
          href={`/b/${businessId}/settings/tax-codes`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors"
        >
          <span>Tax Codes</span>
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {settings.taxLockDate && <div className="mb-5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">VAT-affecting transactions are locked through <strong>{settings.taxLockDate}</strong>.</div>}
      <TaxSettingsForm businessId={businessId} isAdmin={access.membership.role === "administrator"} initial={{ vatRegistered: settings.vatRegistered, trn: settings.trn ?? "", vatRegistrationEffectiveDate: settings.vatRegistrationEffectiveDate ?? "", vatDeregistrationDate: settings.vatDeregistrationDate ?? "", defaultSupplyEmirate: settings.defaultSupplyEmirate as "" | "abu_dhabi" | "dubai" | "sharjah" | "ajman" | "umm_al_quwain" | "ras_al_khaimah" | "fujairah" }} />
    </SettingsShell>
  );
}
