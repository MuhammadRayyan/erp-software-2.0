import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { CurrencySettingsForm } from "@/modules/currency/currency-settings-form";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function CurrencySettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  const settings = getCurrencySettings(businessId, user.id);
  return <div className="page-container max-w-[1120px]">
    <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Settings</Link>
    <div className="page-header"><div><h1 className="page-title">Currencies & exchange rates</h1><p className="page-description">Business-local currency master, dated rate snapshots, and realized FX account mappings.</p></div></div>
    <CurrencySettingsForm businessId={businessId} baseCode={settings.base.code} baseLocked={settings.baseLocked} isAdmin={access.membership.role === "administrator"} currencies={settings.currencies} rates={settings.rates} gainAccounts={settings.gainAccounts} lossAccounts={settings.lossAccounts} gainAccountId={settings.fxMappings.realized_fx_gain_account_id ?? ""} lossAccountId={settings.fxMappings.realized_fx_loss_account_id ?? ""} />
  </div>;
}
