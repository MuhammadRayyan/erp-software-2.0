import Link from "next/link";
import { ArrowRight, Download, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import { getTaxSettings } from "@/modules/tax/tax-settings-service";
import { listVatPeriods } from "@/modules/tax/vat-period-service";
import { NewVatPeriodForm } from "@/modules/tax/vat-period-controls";
import { validateUaeTrn } from "@/modules/tax/trn-validation";

const statusLabel: Record<string, string> = { open: "Open", prepared: "Prepared", finalized: "Finalized", filed_externally: "Filed Externally", reopened: "Reopened" };

export default async function VatPeriodsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "reports");
  const settings = getTaxSettings(businessId, user.id);
  const periods = listVatPeriods(businessId, user.id);
  const trnCheck = validateUaeTrn(settings.trn);
  return <div className="page-container">
    <div className="page-header"><div><div className="flex flex-wrap items-center gap-2"><h1 className="page-title">VAT Return Working Papers</h1><Badge tone={settings.vatRegistered ? "success" : "neutral"}>{settings.vatRegistered ? "VAT enabled" : "Not VAT Registered / Disabled"}</Badge>{!trnCheck.isEmpty && <Badge tone={trnCheck.status === "verified" ? "success" : trnCheck.status === "format_only" ? "warning" : "danger"}>{trnCheck.status === "verified" ? "TRN Checksum Verified" : trnCheck.status === "format_only" ? "TRN Checksum Warning" : "Invalid TRN"}</Badge>}</div><p className="page-description">Preparation records from posted source tax detail and UAE FTA Audit File (FAF) export. This ERP does not submit returns to the FTA or EmaraTax.</p></div><div className="flex flex-wrap gap-2"><Button permission={"export"} asChild variant="secondary"><a href={`/api/businesses/${businessId}/tax/vat/faf`}><Download className="size-4" /> Export FTA Audit File (FAF)</a></Button><Button asChild variant="secondary"><Link href={`/b/${businessId}/tax/vat/review`}><SearchCheck className="size-4" /> VAT Data Review</Link></Button></div></div>
    {!settings.vatRegistered && <div className="mb-5 rounded-md border border-info/25 bg-info/10 px-3 py-2.5 text-sm">Normal accounting remains available. An Administrator can enable VAT under <Link className="font-medium underline" href={`/b/${businessId}/settings/tax`}>UAE VAT settings</Link>.</div>}
    <div className="data-panel mb-6 overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Period</th><th>Dates</th><th>Due</th><th>Status</th><th className="text-right!">Net VAT</th><th /></tr></thead><tbody>{periods.length ? periods.map((period) => <tr key={String(period.id)}><td className="font-medium">{String(period.period_reference)}</td><td>{String(period.start_date)} – {String(period.end_date)}</td><td>{String(period.filing_due_date)}</td><td><div className="flex items-center gap-2"><Badge tone={period.status === "filed_externally" ? "success" : period.status === "finalized" ? "info" : "neutral"}>{statusLabel[String(period.status)] ?? String(period.status)}</Badge>{Boolean(period.needs_review) && <Badge tone="warning">Needs Review</Badge>}</div></td><td className="money text-right">{formatMoney(Number(period.net_vat_minor), access.business.currency)}</td><td className="text-right"><Link className="inline-flex items-center gap-1 text-sm font-medium text-primary" href={`/b/${businessId}/tax/vat/periods/${period.id}`}>Open <ArrowRight className="size-3.5" /></Link></td></tr>) : <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No explicit VAT periods yet.</td></tr>}</tbody></table></div>
    <NewVatPeriodForm businessId={businessId} />
  </div>;
}

