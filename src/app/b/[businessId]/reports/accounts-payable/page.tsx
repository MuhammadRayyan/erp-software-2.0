import { requireModule } from "@/core/permissions/require-module";
import { formatDate } from "@/core/format";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { getPayablesAging } from "@/modules/reports/aging-service";
import { AgingReportView } from "@/modules/reports/aging-report-view";
import { BackLink } from "@/components/back-link";

export default async function AccountsPayablePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  const report = getPayablesAging(businessId, user.id, query.asOf);
  const settings = getCurrencySettings(businessId, user.id);
  const minorUnits = new Map(settings.currencies.map((currency) => [currency.code, currency.minor_unit]));
  return <div className="page-container">
    <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>
    <div className="page-header"><div><h1 className="page-title">Accounts Payable</h1><p className="page-description">Aged as of {formatDate(report.asOfDate)}. Foreign open amounts stay in document currency; carrying amounts and totals are shown in {access.business.currency}.</p></div></div>
    <AgingReportView businessId={businessId} side="payable" report={report} baseCurrency={access.business.currency} minorUnits={minorUnits} />
  </div>;
}
