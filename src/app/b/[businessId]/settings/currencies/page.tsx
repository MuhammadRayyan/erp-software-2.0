import { SettingsShell } from "@/components/settings-shell";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { CurrencySettingsForm } from "@/modules/currency/currency-settings-form";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function CurrencySettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  const settings = getCurrencySettings(businessId, user.id);
  return <SettingsShell businessId={businessId} title="Currencies & exchange rates" description="Business-local currency master, dated rate snapshots, and realized FX account mappings.">
      <CurrencySettingsForm businessId={businessId} baseCode={settings.base.code} baseLocked={settings.baseLocked} isAdmin={access.membership.role === "administrator"} currencies={settings.currencies} rates={settings.rates} gainAccounts={settings.gainAccounts} lossAccounts={settings.lossAccounts} gainAccountId={settings.fxMappings.realized_fx_gain_account_id ?? ""} lossAccountId={settings.fxMappings.realized_fx_loss_account_id ?? ""} />
    </SettingsShell>;
}
