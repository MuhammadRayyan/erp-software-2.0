import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { getReceipt } from "@/modules/receipts/receipt-service";
import { ReceiptViewActions } from "@/modules/receipts/receipt-view-actions";
import { getSourceBankingStatus } from "@/modules/banking/banking-report-service";
import { BackLink } from "@/components/back-link";
import { getDocumentViewData } from "@/modules/document-templates/document-data-extractor";
import { DocumentViewLayout } from "@/modules/document-templates/components/document-view-layout";

export default async function ReceiptViewPage({
  params,
}: {
  params: Promise<{ businessId: string; receiptId: string }>;
}) {
  const { businessId, receiptId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const record = getReceipt(businessId, user.id, receiptId);
  if (!record) notFound();
  const banking = getSourceBankingStatus(businessId, user.id, "receipt", receiptId);
  const receipt = record.receipt;
  const status = String(receipt.document_status) as "posted" | "void";
  const number = String(receipt.receipt_number);

  const viewBundle = getDocumentViewData(
    businessId,
    user.id,
    access.business.name,
    access.business.currency,
    "sales-receipt",
    receiptId
  );

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/sales/receipts`}>Receipts</BackLink>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title tabular">{number}</h1>
            <Badge tone={status === "posted" ? "info" : "danger"}>
              {status === "posted" ? "Posted" : "Reversed"}
            </Badge>
          </div>
          <p className="mt-2 font-medium">
            <Link href={`/b/${businessId}/customers/${String(receipt.customer_id)}`} className="hover:text-primary hover:underline transition-colors">
              {String(receipt.customer_name)}
            </Link>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(String(receipt.date))}</p>
          <p className="money mt-3 text-xl font-semibold">
            {formatMoney(Number(receipt.amount_minor), String(receipt.currency_code))}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bank {formatMoney(Number(receipt.base_amount_minor), access.business.currency)} at 1 {String(receipt.currency_code)} = {String(receipt.exchange_rate_to_base)} {access.business.currency} · Realized FX {formatMoney(Number(receipt.realized_fx_amount_minor), access.business.currency)}
          </p>
        </div>
        <ReceiptViewActions businessId={businessId} receiptId={receiptId} receiptNumber={number} status={status} />
      </div>

      <DocumentViewLayout
        data={viewBundle.data}
        settings={viewBundle.settings}
        variant={viewBundle.variant}
        pdfUrl={viewBundle.pdfUrl}
        documentNumber={number}
      >
        <article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">
          <dl className="grid gap-4 border-b border-border pb-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Customer</dt><dd className="mt-1"><Link href={`/b/${businessId}/customers/${String(receipt.customer_id)}`} className="font-medium text-primary hover:underline">{String(receipt.customer_name)}</Link></dd></div>
            <div><dt className="text-xs text-muted-foreground">Bank / Cash account</dt><dd className="mt-1">{receipt.bank_account_code ? `${receipt.bank_account_code} · ` : ""}{String(receipt.bank_account_name)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Reference</dt><dd className="mt-1">{String(receipt.reference ?? "—")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Description</dt><dd className="mt-1">{String(receipt.description ?? "—")}</dd></div>
          </dl>
          {receipt.unallocated_amount_minor > 0 && status === "posted" && (
            <div className="mt-5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-900 dark:text-emerald-300">
              <span className="font-semibold">Advance Retainer Credit: </span>
              {formatMoney(receipt.unallocated_amount_minor, String(receipt.currency_code))} remains unallocated on this customer&apos;s account and can be applied toward any future invoice.
            </div>
          )}
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Allocations</h2>
              {record.allocations.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {record.allocations.length} invoice{record.allocations.length === 1 ? "" : "s"} settled · Total allocated: {formatMoney(receipt.total_allocated_minor, String(receipt.currency_code))}
                </span>
              )}
            </div>
            {record.allocations.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-md border border-border">
                <table className="data-table min-w-[680px]">
                  <thead>
                    <tr>
                      <th>Sales Invoice</th>
                      <th className="text-right!">Foreign allocated</th>
                      <th className="text-right!">Base carrying released</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td>
                          <Link href={`/b/${businessId}/sales/invoices/${allocation.invoice_id}`} className="tabular font-medium text-primary hover:underline">
                            {allocation.invoice_number}
                          </Link>
                        </td>
                        <td className="money text-right">{formatMoney(allocation.amount_minor, String(receipt.currency_code))}</td>
                        <td className="money text-right">{formatMoney(allocation.base_carrying_amount_released, access.business.currency)}</td>
                        <td>{status === "posted" ? "Active" : "Released by reversal"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-border bg-surface-muted/30 p-4 text-center text-sm text-muted-foreground">
                This receipt was recorded as an unallocated advance deposit. The full amount ({formatMoney(receipt.amount_minor, String(receipt.currency_code))}) is held on customer account as available credit.
              </div>
            )}
          </section>
          <section className="mt-6 border-t border-border pt-5"><h2 className="text-sm font-semibold">Banking</h2><dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Bank Account</dt><dd className="mt-1">{banking?.bank_account_id && access.modules.includes("banking") ? <Link href={`/b/${businessId}/banking/accounts/${banking.bank_account_id}`} className="font-medium text-primary hover:underline">{banking.bank_account_name}</Link> : banking?.bank_account_name || "GL account not mapped"}</dd></div><div><dt className="text-xs text-muted-foreground">Statement match</dt><dd className="mt-1">{banking?.statement_line_id ? `Matched ${banking.statement_date ? formatDate(banking.statement_date) : ""}` : "Not matched"}</dd></div><div><dt className="text-xs text-muted-foreground">Reconciliation</dt><dd className="mt-1">{banking?.reconciled ? "Reconciled" : "Outstanding"}</dd></div></dl></section>
          <section className="mt-6 border-t border-border pt-5"><h2 className="text-sm font-semibold">Generated journal</h2><div className="mt-3 flex flex-wrap gap-3">{record.journals.map((journal) => <Link key={journal.id} href={`/b/${businessId}/accounting/journal/${journal.id}`} className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-primary hover:underline">{journal.source_type === "receipt" ? "Original" : "Reversal"}: {journal.entry_number}</Link>)}</div></section>
        </article>
      </DocumentViewLayout>
    </div>
  );
}
