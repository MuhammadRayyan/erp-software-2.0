import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { NoticeToast } from "@/components/notice-toast";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getPurchaseQuote, listPurchaseQuoteRevisions } from "@/modules/purchase-quotes/purchase-quote-service";
import { StatusBadge } from "@/components/status-badge";
import { PurchaseQuoteViewActions } from "@/modules/purchase-quotes/purchase-quote-view-actions";
import { PurchaseQuoteRevisionSwitcher } from "@/modules/purchase-quotes/purchase-quote-revision-switcher";
import { ProjectLinks } from "@/modules/projects/project-links";
import { buildDocumentEmailContext, buildDocumentEmailDefaults } from "@/modules/email/email-defaults";

export default async function PurchaseQuoteViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; quoteId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { businessId, quoteId } = await params;
  const { notice } = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");
  const record = getPurchaseQuote(businessId, user.id, quoteId);
  if (!record) notFound();
  const { quote, supplier, lines } = record;
  const currency = quote.currencyCode;
  const linkedProjects = Array.from(
    new Map(lines.flatMap((line) => (line.project ? [[line.project.id, line.project] as const] : []))).values(),
  );
  const showLineProjects = linkedProjects.length > 1;

  const revisions = listPurchaseQuoteRevisions(businessId, user.id, quoteId);
  const latestRevision = revisions.find((r) => r.is_latest_revision);
  const isViewingOlderRevision = !quote.isLatestRevision || quote.documentStatus === "superseded";
  const emailContext = buildDocumentEmailContext(access.business.name, "Purchase Quote", record, record.supplier.email ?? "");
  const emailDefaults = buildDocumentEmailDefaults(emailContext, record.supplier.email ?? "");

  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <Link
        href={`/b/${businessId}/purchases/quotes`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Purchase Quotes
      </Link>

      {isViewingOlderRevision && latestRevision && latestRevision.id !== quote.id && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              You are viewing <strong>Revision {quote.revisionNumber}</strong> ({quote.documentStatus}).
            </span>
          </div>
          <Link
            href={`/b/${businessId}/purchases/quotes/${latestRevision.id}`}
            className="font-semibold underline hover:text-foreground"
          >
            Switch to Latest ({latestRevision.quote_number}) →
          </Link>
        </div>
      )}

      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title tabular">{quote.quoteNumber}</h1>
            <PurchaseQuoteRevisionSwitcher
              businessId={businessId}
              currentQuoteId={quote.id}
              revisions={revisions}
            />
            <StatusBadge status={quote.documentStatus} />
          </div>
          <p className="mt-2 text-base font-medium">{supplier.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quote date: {formatDate(quote.quoteDate)}
            {quote.expiryDate ? ` · Expiry: ${formatDate(quote.expiryDate)}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="money text-xl font-semibold">{formatMoney(quote.totalMinor, currency)}</span>
          </div>
        </div>
        <PurchaseQuoteViewActions
          businessId={businessId}
          quoteId={quote.id}
          quoteNumber={quote.quoteNumber}
          documentStatus={quote.documentStatus}
          emailDefaults={emailDefaults}
        />
      </div>

      {currency !== access.business.currency && (
        <section aria-label="Currency snapshot" className="mb-5 rounded-lg border border-border bg-surface-raised p-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Stored rate</dt>
              <dd className="money mt-1">
                1 {currency} = {quote.exchangeRateToBase} {access.business.currency}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Rate date</dt>
              <dd className="mt-1">{formatDate(quote.exchangeRateDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Rate source</dt>
              <dd className="mt-1">{quote.exchangeRateSource}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Base equivalent</dt>
              <dd className="money mt-1 font-semibold">{formatMoney(quote.baseTotalMinor, access.business.currency)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Base VAT {formatMoney(quote.baseTaxMinor, access.business.currency)} · Operational quote commitment snapshot.
          </p>
        </section>
      )}

      <article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">
        <div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Supplier</p>
            <p className="mt-2 font-semibold">{supplier.name}</p>
            {supplier.email && <p className="mt-1 text-sm text-muted-foreground">{supplier.email}</p>}
            {supplier.phone && <p className="text-sm text-muted-foreground">{supplier.phone}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:justify-self-end">
            <dt className="text-muted-foreground">Quote date</dt>
            <dd className="text-right">{formatDate(quote.quoteDate)}</dd>
            <dt className="text-muted-foreground">Expiry date</dt>
            <dd className="text-right">{quote.expiryDate ? formatDate(quote.expiryDate) : "—"}</dd>
            <dt className="text-muted-foreground">Reference / RFQ</dt>
            <dd className="text-right">{quote.reference || "—"}</dd>
            <dt className="text-muted-foreground">Project</dt>
            <dd className="text-right">
              <ProjectLinks businessId={businessId} projects={linkedProjects} />
            </dd>
          </dl>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className={`data-table ${showLineProjects ? "min-w-[1020px]" : "min-w-[880px]"}`}>
            <thead>
              <tr>
                <th>Item / Description</th>
                <th className="text-right!">Qty</th>
                <th className="text-right!">Rate</th>
                <th className="text-right!">Discount</th>
                <th>Expense Account</th>
                <th>Tax Code</th>
                {showLineProjects && <th>Project</th>}
                <th className="text-right!">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <span className="font-medium">
                      {line.item ? `${line.item.sku ? `${line.item.sku} · ` : ""}${line.item.name}` : line.description}
                    </span>
                    {line.item && <span className="mt-0.5 block text-xs text-muted-foreground">{line.description}</span>}
                  </td>
                  <td className="money text-right">{quantityMicrosToInput(line.quantityMicros)}</td>
                  <td className="money text-right">{formatMoney(line.unitPriceMinor, currency)}</td>
                  <td className="money text-right">
                    {line.discountType === "percentage"
                      ? `${line.discountValue}%`
                      : line.discountType === "fixed"
                        ? formatMoney(Number(line.discountValue) * 100, currency)
                        : "—"}
                  </td>
                  <td>
                    <span className="text-xs text-muted-foreground">
                      {line.expenseAccount ? `${line.expenseAccount.code} ${line.expenseAccount.name}` : "—"}
                    </span>
                  </td>
                  <td>{line.taxCode ? line.taxCode.name : "—"}</td>
                  {showLineProjects && (
                    <td>
                      <ProjectLinks businessId={businessId} projects={line.project ? [line.project] : []} empty="—" />
                    </td>
                  )}
                  <td className="money text-right">{formatMoney(line.grossAmountMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-6 ml-auto w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="money">{formatMoney(quote.subtotalMinor, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT</dt>
            <dd className="money">{formatMoney(quote.taxMinor, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="money">{formatMoney(quote.totalMinor, currency)}</dd>
          </div>
        </dl>

        {quote.notes && (
          <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
        {quote.terms && (
          <div className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Terms & Conditions</p>
            <p className="mt-1 whitespace-pre-wrap">{quote.terms}</p>
          </div>
        )}
      </article>
    </div>
  );
}
