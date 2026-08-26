import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { NoticeToast } from "@/components/notice-toast";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { formatDate, formatDateTime, formatMoney } from "@/core/format";
import { parseModules } from "@/core/permissions/permissions";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { getBankBalance, getDashboardCounts } from "@/modules/reports/report-service";
import { ManagerSummary } from "./manager-summary";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";
import { DocumentStatusBadge, PaymentStatusBadge } from "@/modules/sales-invoices/invoice-status";
import { listSentEmails } from "@/modules/email/email-service";
import { parseMailboxes } from "@/modules/email/email-driver";
import { KpiCards, type KpiCardData } from "./kpi-cards";
import { OverviewControls, type ServerDateRange } from "./overview-controls";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function decodeServerRange(preferences: Record<string, string>): ServerDateRange | undefined {
  const raw = preferences["overview.range"];
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    const from = typeof record.from === "string" && (record.from === "" || DATE_PATTERN.test(record.from)) ? record.from : "";
    const to = typeof record.to === "string" && (record.to === "" || DATE_PATTERN.test(record.to)) ? record.to : "";
    if (!from && !to) return undefined;
    return { from, to };
  } catch {
    return undefined;
  }
}

export default async function OverviewPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ notice?: string; from?: string; to?: string }> }) {
  const { businessId } = await params;
  const { notice, from: rawFrom, to: rawTo } = await searchParams;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) notFound();

  const from = DATE_PATTERN.test(rawFrom ?? "") ? rawFrom : undefined;
  const to = DATE_PATTERN.test(rawTo ?? "") ? rawTo : undefined;
  const currency = access.business.currency;

  const invoiceList = listInvoices(businessId, user.id);
  const posted = invoiceList.filter((invoice) => invoice.documentStatus === "posted");
  // Balance-based KPIs are always "as of today"; only Posted Sales follows the selected period.
  const outstanding = posted.reduce((sum, invoice) => sum + invoice.baseBalanceMinor, 0);
  const overdue = posted.filter((invoice) => invoice.paymentStatus === "overdue").reduce((sum, invoice) => sum + invoice.baseBalanceMinor, 0);
  const canViewBanking = parseModules(access.membership.role, access.membership.modulesJson).includes("banking");
  const canViewSales = parseModules(access.membership.role, access.membership.modulesJson).includes("sales");
  const bankBalance = canViewBanking ? getBankBalance(businessId, user.id) : null;
  const periodPosted = from || to
    ? listInvoices(businessId, user.id, { from, to }).filter((invoice) => invoice.documentStatus === "posted")
    : posted;
  const sales = periodPosted.reduce((sum, invoice) => sum + invoice.baseTotalMinor, 0);
  const recentEmails = canViewSales ? listSentEmails(businessId, user.id).slice(0, 4) : [];
  const periodLabel = from || to
    ? `${from ? formatDate(from, { day: "numeric", month: "short", year: "numeric" }) : "start"} – ${to ? formatDate(to, { day: "numeric", month: "short", year: "numeric" }) : "today"}`
    : "all time";
  // Server-side preferences: the overview date-range now syncs across devices via the
  // system DB. The URL is still the source of truth for the active render; the server
  // snapshot is the "last saved choice" used to seed the URL on a fresh navigation.
  const preferences = listPreferences(businessId, user.id);
  const serverRange = decodeServerRange(preferences);
  const cards: KpiCardData[] = [
    { id: "posted-sales", icon: "sales", label: "Posted Sales", value: formatMoney(sales, currency), note: `${periodPosted.length} posted invoices`, caption: periodLabel, tooltip: "Total of posted sales invoices in the selected period (base currency)." },
    { id: "outstanding", icon: "receivables", label: "Outstanding Receivables", value: formatMoney(outstanding, currency), note: `${posted.filter((item) => item.balanceMinor > 0).length} open invoices`, caption: "as of today", tooltip: "Unsettled receivable balances across all posted invoices, regardless of the selected period." },
    { id: "overdue", icon: "overdue", label: "Overdue", value: formatMoney(overdue, currency), note: `${posted.filter((item) => item.paymentStatus === "overdue").length} overdue invoices`, caption: "as of today", tooltip: "Posted invoices past their due date that still have an open balance." },
    ...(bankBalance === null ? [] : [{ id: "bank", icon: "bank" as const, label: "Bank & Cash", value: formatMoney(bankBalance, currency), note: "Posted receipt balance", caption: "as of today", tooltip: "Sum of posted bank and cash account balances from the general ledger." }]),
  ];
  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <div className="page-header"><div><h1 className="page-title">Overview</h1><p className="page-description">A practical accounting snapshot of {access.business.name}.</p></div></div>
      <OverviewControls from={from} to={to} serverRange={serverRange} businessId={businessId} />
      <KpiCards cards={cards} businessId={businessId} serverSnapshot={decodeColumnSnapshots(preferences)["overview-cards"]} />
      <ManagerSummary businessId={businessId} counts={getDashboardCounts(businessId, user.id)} />
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="data-panel lg:col-span-2">
          <div className="flex h-12 items-center justify-between border-b border-border px-4"><h2 className="font-semibold">Recent Invoices</h2><Link href={`/b/${businessId}/sales/invoices`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">View all <ArrowRight className="size-3.5" /></Link></div>
          {invoiceList.length ? <div className="overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th className="text-right!">Total</th><th>Status</th></tr></thead><tbody>{invoiceList.slice(0, 6).map((invoice) => <tr key={invoice.id} className="hover:bg-surface-muted/40"><td><Link href={`/b/${businessId}/sales/invoices/${invoice.id}`} className="tabular font-medium text-primary hover:underline">{invoice.invoiceNumber}</Link></td><td>{invoice.customerName}</td><td>{formatDate(invoice.invoiceDate, { day: "2-digit", month: "short" })}</td><td className="money text-right">{formatMoney(invoice.totalMinor, invoice.currencyCode, invoice.currencyMinorUnit)}</td><td><div className="flex gap-1.5"><DocumentStatusBadge status={invoice.documentStatus} />{invoice.paymentStatus && <PaymentStatusBadge status={invoice.paymentStatus} />}</div></td></tr>)}</tbody></table></div> : <div className="p-8 text-center"><p className="font-medium">No recent invoices</p><p className="mt-1 text-sm text-muted-foreground">Create an invoice to see it listed here.</p></div>}
        </section>
        {canViewSales && (
          <section className="data-panel">
            <div className="flex h-12 items-center justify-between border-b border-border px-4"><h2 className="flex items-center gap-2 font-semibold"><Mail className="size-4 text-muted-foreground" /> Recent Emails</h2><Link href={`/b/${businessId}/emails`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">View all <ArrowRight className="size-3.5" /></Link></div>
            {recentEmails.length ? (
              <ul className="divide-y divide-border">
                {recentEmails.map((email) => {
                  const to = parseMailboxes(email.toAddresses)[0];
                  return (
                    <li key={email.id} className="hover:bg-surface-muted/40">
                      <Link href={`/b/${businessId}/emails/${email.id}`} className="block px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium text-foreground">{email.subject}</p>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(email.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          To {to ? (to.name ?? to.email) : "—"}{email.relatedDocumentNumber ? ` · ${email.relatedDocumentNumber}` : ""}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-8 text-center">
                <Mail className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden />
                <p className="font-medium">No emails sent yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Open an invoice and use the Email action.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
