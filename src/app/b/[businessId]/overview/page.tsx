import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Banknote, CircleDollarSign, ReceiptText } from "lucide-react";
import { NoticeToast } from "@/components/notice-toast";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { formatDate, formatMoney } from "@/core/format";
import { parseModules } from "@/core/permissions/permissions";
import { getBankBalance } from "@/modules/reports/report-service";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";
import { DocumentStatusBadge, PaymentStatusBadge } from "@/modules/sales-invoices/invoice-status";

export default async function OverviewPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { businessId } = await params;
  const { notice } = await searchParams;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) notFound();
  
  const invoiceList = listInvoices(businessId, user.id);
  const posted = invoiceList.filter((invoice) => invoice.documentStatus === "posted");
  const sales = posted.reduce((sum, invoice) => sum + invoice.baseTotalMinor, 0);
  const outstanding = posted.reduce((sum, invoice) => sum + invoice.baseBalanceMinor, 0);
  const overdue = posted.filter((invoice) => invoice.paymentStatus === "overdue").reduce((sum, invoice) => sum + invoice.baseBalanceMinor, 0);
  const canViewBanking = parseModules(access.membership.role, access.membership.modulesJson).includes("banking");
  const bankBalance = canViewBanking ? getBankBalance(businessId, user.id) : null;
  const cards = [
    { label: "Posted Sales", value: sales, note: `${posted.length} posted invoices`, icon: CircleDollarSign },
    { label: "Outstanding Receivables", value: outstanding, note: `${posted.filter((item) => item.balanceMinor > 0).length} open invoices`, icon: ReceiptText },
    { label: "Overdue", value: overdue, note: `${posted.filter((item) => item.paymentStatus === "overdue").length} overdue invoices`, icon: AlertTriangle },
    ...(bankBalance === null ? [] : [{ label: "Bank & Cash", value: bankBalance, note: "Posted receipt balance", icon: Banknote }]),
  ];
  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <div className="page-header"><div><h1 className="page-title">Overview</h1><p className="page-description">A practical accounting snapshot of {access.business.name}.</p></div></div>
      <section aria-label="Business summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <article key={card.label} className="rounded-lg border border-border bg-surface-raised p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">{card.label}</p><card.icon className="size-4 text-muted-foreground" /></div><p className="money mt-3 text-xl font-semibold tracking-[-0.02em]">{formatMoney(card.value, access.business.currency)}</p><p className="mt-1 text-xs text-muted-foreground">{card.note}</p></article>)}
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_0.8fr]">
        <section className="data-panel">
          <div className="flex h-12 items-center justify-between border-b border-border px-4"><h2 className="font-semibold">Recent Invoices</h2><Link href={`/b/${businessId}/sales/invoices`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">View all <ArrowRight className="size-3.5" /></Link></div>
          {invoiceList.length ? <div className="overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th className="text-right!">Total</th><th>Status</th></tr></thead><tbody>{invoiceList.slice(0, 6).map((invoice) => <tr key={invoice.id}><td><Link href={`/b/${businessId}/sales/invoices/${invoice.id}`} className="tabular font-medium text-primary hover:underline">{invoice.invoiceNumber}</Link></td><td>{invoice.customerName}</td><td>{formatDate(invoice.invoiceDate, { day: "2-digit", month: "short" })}</td><td className="money text-right">{formatMoney(invoice.totalMinor, invoice.currencyCode, invoice.currencyMinorUnit)}</td><td><div className="flex gap-1.5"><DocumentStatusBadge status={invoice.documentStatus} />{invoice.paymentStatus && <PaymentStatusBadge status={invoice.paymentStatus} />}</div></td></tr>)}</tbody></table></div> : <div className="p-8 text-center"><p className="font-medium">No recent invoices</p><p className="mt-1 text-sm text-muted-foreground">Create an invoice to see activity here.</p></div>}
        </section>
        <section className="rounded-lg border border-border bg-surface-raised"><div className="flex h-12 items-center border-b border-border px-4"><h2 className="font-semibold">Recent Activity</h2></div><div className="space-y-0 px-4">{invoiceList.slice(0, 5).map((invoice) => <div key={invoice.id} className="border-b border-border py-3 last:border-0"><p className="text-[13px]"><span className="tabular font-medium">{invoice.invoiceNumber}</span> updated</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(invoice.invoiceDate)} · {invoice.customerName}</p></div>)}{!invoiceList.length && <p className="py-7 text-center text-sm text-muted-foreground">Activity will appear here.</p>}</div></section>
      </div>
    </div>
  );
}
