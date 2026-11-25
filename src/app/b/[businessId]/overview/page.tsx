import Link from "next/link";
import { PermissionDenied } from "@/components/permission-denied";
import { notFound } from "next/navigation";
import { ArrowRight, Landmark, Mail, ShieldCheck } from "lucide-react";
import { NoticeToast } from "@/components/notice-toast";
import { StatusBadge } from "@/components/status-badge";
import { getPdcMaturitySummary } from "@/modules/banking/pdc-service";
import { listApprovalRequests } from "@/modules/approvals/approval-service";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { formatDate, formatDateTime, formatMoney, getBusinessTodayIso } from "@/core/format";
import { hasActionPermission } from "@/core/permissions/permissions";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import {
  getBankBalance,
  getMonthlyFinancialTrend,
  getReceivablesAgingSummary,
} from "@/modules/reports/report-service";
import { FinancialSummary } from "./financial-summary";
import { getOverviewInvoiceMetrics } from "@/modules/sales-invoices/invoice-service";
import { DocumentStatusBadge, PaymentStatusBadge } from "@/modules/sales-invoices/invoice-status";
import { listSentEmails } from "@/modules/email/email-service";
import { parseMailboxes } from "@/modules/email/email-driver";
import { KpiCards, type KpiCardData } from "./kpi-cards";
import { OverviewCustomization, OverviewCustomizeMenu, OverviewSection } from "./overview-customization";
import { getPayablesDueSummary } from "@/modules/purchase-invoices/purchase-invoice-service";
import { getNextVatReturn, getUnreconciledStatementSummary } from "@/modules/reports/overview-metrics-service";
import { OverviewControls, type ServerDateRange } from "./overview-controls";
import { getCashFlowForecast, type CashFlowForecastData } from "@/modules/reports/cash-flow-forecast-service";
import type { OverviewChartsPayload } from "./overview-charts-panel";
import { OverviewTabsLayout } from "./overview-tabs-layout";
import { getHiddenNavPaths } from "@/modules/preferences/nav-customization-service";
import { isNavPathVisible } from "@/components/app-shell/nav-customization";

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

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ notice?: string; from?: string; to?: string; view?: string }>;
}) {
  const { businessId } = await params;
  const { notice, from: rawFrom, to: rawTo, view: rawView } = await searchParams;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) notFound();

  const from = DATE_PATTERN.test(rawFrom ?? "") ? rawFrom : undefined;
  const to = DATE_PATTERN.test(rawTo ?? "") ? rawTo : undefined;
  const initialView = rawView === "charts" || rawView === "operations" ? "charts" : "financial";
  const currency = access.business.currency;

  const canViewBanking = hasActionPermission(businessId, user.id, "banking", "view");
  const canViewSales = hasActionPermission(businessId, user.id, "sales", "view");
  const canViewReports = hasActionPermission(businessId, user.id, "reports", "view");
  const canViewPurchases = hasActionPermission(businessId, user.id, "purchases", "view");
  // VAT pages are part of the Reports module.
  const canViewTax = canViewReports;
  const hiddenNavPaths = getHiddenNavPaths(businessId, user.id);
  const showEmailsWidget = canViewSales && isNavPathVisible("/emails", hiddenNavPaths);
  const showPdcsNav = canViewBanking && isNavPathVisible("/banking/pdcs", hiddenNavPaths);
  const isChartView = initialView === "charts";

  const periodLabel = from || to
    ? `${from ? formatDate(from, { day: "numeric", month: "short", year: "numeric" }) : "start"} – ${to ? formatDate(to, { day: "numeric", month: "short", year: "numeric" }) : "today"}`
    : "all time";

  // Defer off-tab work: initial financial view never computes charts/trend/aging/forecast,
  // and chart view never queries financial KPIs or recent lists.
  const invoiceMetrics = !isChartView && canViewSales
    ? getOverviewInvoiceMetrics(businessId, user.id, { from, to })
    : null;
  const recentInvoices = invoiceMetrics?.recentInvoices ?? [];
  const bankBalance = !isChartView && canViewBanking ? getBankBalance(businessId, user.id) : null;
  const recentEmails = !isChartView && showEmailsWidget ? listSentEmails(businessId, user.id).slice(0, 4) : [];
  const preferences = !isChartView ? listPreferences(businessId, user.id) : {};
  const serverRange = !isChartView ? decodeServerRange(preferences) : undefined;

  // All 4 primary cards: Posted Sales, Outstanding Receivables, Overdue, and Bank & Cash
  const allCards: KpiCardData[] = !isChartView
    ? [
        {
          id: "posted-sales",
          icon: "sales",
          label: "Posted Sales",
          value: formatMoney(invoiceMetrics?.postedSalesBaseMinor ?? 0, currency),
          note: `${invoiceMetrics?.postedSalesCount ?? 0} posted invoices`,
          caption: periodLabel,
          tooltip: "Total of posted sales invoices in the selected period (base currency).",
          href: `/b/${businessId}/sales/invoices`,
        },
        {
          id: "outstanding",
          icon: "receivables",
          label: "Outstanding Receivables",
          value: formatMoney(invoiceMetrics?.outstandingBaseMinor ?? 0, currency),
          note: `${invoiceMetrics?.openCount ?? 0} open invoices`,
          caption: "as of today",
          tooltip: "Unsettled receivable balances across all posted invoices, regardless of the selected period.",
          href: `/b/${businessId}/sales/invoices?status=unpaid`,
        },
        {
          id: "overdue",
          icon: "overdue",
          label: "Overdue",
          value: formatMoney(invoiceMetrics?.overdueBaseMinor ?? 0, currency),
          note: `${invoiceMetrics?.overdueCount ?? 0} overdue invoices`,
          caption: "as of today",
          tooltip: "Posted invoices past their due date that still have an open balance.",
          href: `/b/${businessId}/sales/invoices?status=overdue`,
        },
        {
          id: "bank",
          icon: "bank",
          label: "Bank & Cash",
          value: formatMoney(bankBalance ?? 0, currency),
          note: "Posted receipt balance",
          caption: "as of today",
          tooltip: "Sum of posted bank and cash account balances from the general ledger.",
          href: `/b/${businessId}/banking/accounts`,
        },
      ]
    : [];

  const today = getBusinessTodayIso();
  const payablesDue = !isChartView && canViewPurchases ? getPayablesDueSummary(businessId, user.id, today, 7) : null;
  const nextVat = !isChartView && canViewTax ? getNextVatReturn(businessId, user.id, today) : null;
  const unreconciled = !isChartView && canViewBanking ? getUnreconciledStatementSummary(businessId, user.id) : null;
  const pendingApprovals = !isChartView ? listApprovalRequests(businessId, user.id, { status: "pending" }) : [];
  const actionableApprovals = pendingApprovals.filter((r) => r.canApprove);
  const attentionCards: KpiCardData[] = [
    ...(payablesDue ? [{
      id: "payables-due",
      icon: "payables" as const,
      label: "Bills Due (7 days)",
      value: formatMoney(payablesDue.dueBaseMinor, currency),
      note: payablesDue.overdueCount > 0
        ? `${payablesDue.dueCount} bills · ${payablesDue.overdueCount} overdue`
        : `${payablesDue.dueCount} ${payablesDue.dueCount === 1 ? "bill" : "bills"} due`,
      caption: "as of today",
      tooltip: "Open posted bills due within the next 7 days, including overdue bills (base currency).",
      href: `/b/${businessId}/purchases/invoices?status=unpaid`,
      attention: payablesDue.overdueCount > 0,
    }] : []),
    ...(canViewTax ? [nextVat ? {
      id: "vat-due",
      icon: "vat" as const,
      label: "Next VAT Return",
      value: formatMoney(nextVat.netVatMinor, currency),
      note: nextVat.daysUntilDue < 0
        ? `${nextVat.periodReference} · overdue by ${-nextVat.daysUntilDue} days`
        : `${nextVat.periodReference} · due in ${nextVat.daysUntilDue} days`,
      caption: `due ${formatDate(nextVat.filingDueDate)}`,
      tooltip: "Net VAT payable (output less recoverable input) for the earliest open VAT period.",
      href: `/b/${businessId}/tax/vat/periods/${nextVat.periodId}`,
      attention: nextVat.daysUntilDue <= 7,
    } : {
      id: "vat-due",
      icon: "vat" as const,
      label: "Next VAT Return",
      value: "—",
      note: "No open VAT period",
      tooltip: "Create a VAT period to track the next filing deadline.",
      href: `/b/${businessId}/tax/vat`,
    }] : []),
    ...(unreconciled ? [{
      id: "unreconciled",
      icon: "reconcile" as const,
      label: "Unreconciled Bank Lines",
      value: String(unreconciled.count),
      note: unreconciled.count === 1 ? "statement line to match" : "statement lines to match",
      tooltip: "Imported bank statement lines that are not yet matched to a book entry.",
      href: unreconciled.busiestAccountId
        ? `/b/${businessId}/banking/accounts/${unreconciled.busiestAccountId}?section=reconciliation`
        : `/b/${businessId}/banking/accounts`,
      attention: unreconciled.count > 0,
    }] : []),
    ...(!isChartView ? [{
      id: "approvals",
      icon: "approvals" as const,
      label: "Approvals",
      value: String(actionableApprovals.length),
      note: actionableApprovals.length === 1 ? "document awaiting you" : "documents awaiting you",
      caption: pendingApprovals.length > actionableApprovals.length ? `${pendingApprovals.length} pending in total` : undefined,
      tooltip: "Maker-Checker submissions you can approve.",
      href: `/b/${businessId}/approvals`,
      attention: actionableApprovals.length > 0,
    }] : []),
  ];

  const cards = [
    ...allCards.filter(card => card.id === "bank" ? canViewBanking : canViewSales),
    ...attentionCards,
  ];

  // Financial trends & Receivables aging summary (only when chart view is active on initial SSR load)
  const trend = isChartView && canViewReports ? getMonthlyFinancialTrend(businessId, user.id, 6) : [];
  const aging = isChartView && canViewReports ? getReceivablesAgingSummary(businessId, user.id) : null;
  let initialForecast: CashFlowForecastData | null = null;
  if (isChartView && canViewReports) {
    try {
      initialForecast = getCashFlowForecast(businessId, user.id, { horizonDays: 30 });
    } catch {
      initialForecast = null;
    }
  }
  const initialChartData: OverviewChartsPayload | null = isChartView
    ? { canViewReports, currency, trend, aging, forecast: initialForecast }
    : null;
  const pdcSummary = !isChartView && showPdcsNav ? getPdcMaturitySummary(businessId, user.id, 30) : null;
  const hasActivePdcs = Boolean(
    pdcSummary &&
      (pdcSummary.heldReceivableMinor > 0 ||
        pdcSummary.heldPayableMinor > 0 ||
        pdcSummary.dueSoonCount > 0 ||
        pdcSummary.overdueCount > 0 ||
        pdcSummary.upcomingCheques.length > 0),
  );


  const overviewSections = [
    ...(pendingApprovals.length > 0 ? [{ id: "approvals-banner", label: "Approval reminder" }] : []),
    ...(canViewReports ? [{ id: "financial-summary", label: "Financial summary" }] : []),
    ...(canViewSales ? [{ id: "recent-invoices", label: "Recent invoices" }] : []),
    ...(showEmailsWidget ? [{ id: "recent-emails", label: "Recent emails" }] : []),
    ...(showPdcsNav && hasActivePdcs ? [{ id: "pdc-tracker", label: "PDC maturity tracker" }] : []),
  ];
  const columnSnapshots = decodeColumnSnapshots(preferences);

  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-description">A practical accounting snapshot of {access.business.name}.</p>
        </div>
      </div>

      <OverviewTabsLayout
        businessId={businessId}
        initialView={initialView}
        initialChartData={initialChartData}
        financialView={
          isChartView ? null : (
          <OverviewCustomization
            businessId={businessId}
            cards={cards.map(({ id, label }) => ({ id, label }))}
            sections={overviewSections}
            cardSnapshot={columnSnapshots["overview-cards"]}
            sectionSnapshot={columnSnapshots["overview-sections"]}
          >
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <OverviewControls from={from} to={to} serverRange={serverRange} businessId={businessId} />
              <OverviewCustomizeMenu />
            </div>
            {pendingApprovals.length > 0 && <OverviewSection id="approvals-banner">
              <section className="rounded-lg border border-warning/40 bg-warning/10 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="size-5 text-warning shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {actionableApprovals.length > 0
                        ? `${actionableApprovals.length} document(s) awaiting your approval`
                        : `${pendingApprovals.length} submitted document(s) pending approval`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Review Maker-Checker submissions before ledger posting or order issuance.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/b/${businessId}/approvals`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Open Approval Queue <ArrowRight className="size-3.5" />
                </Link>
              </section>
            </OverviewSection>}
            <KpiCards cards={cards} />
            {canViewReports && <OverviewSection id="financial-summary"><FinancialSummary businessId={businessId} userId={user.id} currency={currency} /></OverviewSection>}
            {!cards.length && !canViewReports && <PermissionDenied module="financial overview" returnHref={`/b/${businessId}/settings/profile`} returnLabel="Open your profile" />}
            <div className="flex flex-col gap-5 lg:flex-row">
              {canViewSales && <OverviewSection id="recent-invoices" className="min-w-0 lg:flex-[2]"><section className="data-panel h-full">
                <div className="flex h-12 items-center justify-between border-b border-border px-4">
                  <h2 className="font-semibold">Recent Invoices</h2>
                  <Link href={`/b/${businessId}/sales/invoices`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    View all <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                {recentInvoices.length ? (
                  <div className="overflow-x-auto">
                    <table className="data-table min-w-[760px]">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Customer</th>
                          <th>Date</th>
                          <th className="text-right!">Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentInvoices.map((invoice) => (
                          <tr key={invoice.id} className="hover:bg-surface-muted/40">
                            <td>
                              <Link href={`/b/${businessId}/sales/invoices/${invoice.id}`} className="tabular font-medium text-primary hover:underline">
                                {invoice.invoiceNumber}
                              </Link>
                            </td>
                            <td>{invoice.customerName}</td>
                            <td>{formatDate(invoice.invoiceDate, { day: "2-digit", month: "short" })}</td>
                            <td className="money text-right">
                              {formatMoney(invoice.totalMinor, invoice.currencyCode, invoice.currencyMinorUnit)}
                            </td>
                            <td>
                              <div className="flex gap-1.5">
                                <DocumentStatusBadge status={invoice.documentStatus} />
                                {invoice.paymentStatus && <PaymentStatusBadge status={invoice.paymentStatus} />}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="font-medium">No recent invoices</p>
                    <p className="mt-1 text-sm text-muted-foreground">Create an invoice to see it listed here.</p>
                  </div>
                )}
              </section></OverviewSection>}
              {showEmailsWidget && (
                <OverviewSection id="recent-emails" className="min-w-0 lg:flex-1"><section className="data-panel h-full">
                  <div className="flex h-12 items-center justify-between border-b border-border px-4">
                    <h2 className="flex items-center gap-2 font-semibold">
                      <Mail className="size-4 text-muted-foreground" /> Recent Emails
                    </h2>
                    <Link href={`/b/${businessId}/emails`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      View all <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
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
                </section></OverviewSection>
              )}
            </div>
              {showPdcsNav && pdcSummary && hasActivePdcs && (
                <OverviewSection id="pdc-tracker"><section className="data-panel">
                  <div className="flex h-12 items-center justify-between border-b border-border px-4">
                    <h2 className="flex items-center gap-2 font-semibold">
                      <Landmark className="size-4 text-primary" /> PDC Maturity Tracker (Next 30 Days)
                    </h2>
                    <Link href={`/b/${businessId}/banking/pdcs`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Manage PDCs <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-3 border-b border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Held Receivable PDCs</p>
                      <p className="money mt-0.5 text-base font-semibold">{formatMoney(pdcSummary.heldReceivableMinor, currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Held Payable PDCs</p>
                      <p className="money mt-0.5 text-base font-semibold">{formatMoney(pdcSummary.heldPayableMinor, currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Maturing ≤ 30d / Overdue</p>
                      <p className="mt-0.5 text-base font-semibold tabular-nums">
                        {pdcSummary.dueSoonCount} maturing · <span className={pdcSummary.overdueCount > 0 ? "text-danger" : ""}>{pdcSummary.overdueCount} overdue</span>
                      </p>
                    </div>
                  </div>
                  {pdcSummary.upcomingCheques.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="data-table min-w-[640px]">
                        <thead>
                          <tr>
                            <th>PDC #</th>
                            <th>Direction</th>
                            <th>Party</th>
                            <th>Maturity</th>
                            <th className="text-right!">Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pdcSummary.upcomingCheques.map((pdc) => (
                            <tr key={pdc.id}>
                              <td className="font-mono text-xs">{pdc.pdcNumber}</td>
                              <td className="capitalize text-xs">{pdc.direction}</td>
                              <td>{pdc.customerName || pdc.supplierName || "—"}</td>
                              <td className={pdc.maturityDate < pdcSummary.today ? "text-danger font-medium" : ""}>{formatDate(pdc.maturityDate)}</td>
                              <td className="money text-right">{formatMoney(pdc.amountMinor, pdc.currencyCode)}</td>
                              <td><StatusBadge status={pdc.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-4 py-5 text-sm text-muted-foreground">
                      No open post-dated cheques maturing soon.
                    </div>
                  )}
                </section></OverviewSection>
              )}
          </div>
          </OverviewCustomization>
          )
        }
      />
    </div>
  );
}
