import Link from "next/link";
import { ArrowLeft, Tag } from "lucide-react";
import { notFound } from "next/navigation";
import { NoticeToast } from "@/components/notice-toast";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { quantityMicrosToInput, rateBasisPointsToPercent } from "@/modules/accounting/calculations/money";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { formatCustomFieldValue } from "@/modules/custom-fields/custom-field-display";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";
import { DocumentStatusBadge, PaymentStatusBadge } from "@/modules/sales-invoices/invoice-status";
import { InvoiceViewActions } from "@/modules/sales-invoices/invoice-view-actions";
import { ProjectLinks } from "@/modules/projects/project-links";
import { emirateLabels, type Emirate } from "@/modules/tax/uae-vat-config";
import { getEInvoiceForSource } from "@/modules/einvoicing/einvoice-service";
import { buildInvoiceEmailContext, buildInvoiceEmailDefaults } from "@/modules/email/email-defaults";
import { EInvoiceSourcePanel } from "@/modules/einvoicing/source-panel";

export default async function InvoiceViewPage({ params, searchParams }: { params: Promise<{ businessId: string; invoiceId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { businessId, invoiceId } = await params;
  const { notice } = await searchParams;
  const { user, access } = await requireModule(businessId, "sales");
  const record = getInvoice(businessId, user.id, invoiceId);
  if (!record) notFound();
  const { invoice, customer, lines } = record;
  const currency = invoice.currencyCode;
  const eInvoice = invoice.documentStatus === "posted" ? getEInvoiceForSource(businessId, user.id, "sales_invoice", invoiceId) : null;
  const eInvoiceLocked = Boolean(eInvoice && ["Submitted", "Accepted", "Rejected"].includes(eInvoice.status));
  const linkedProjects = Array.from(new Map(lines.flatMap((line) => line.project ? [[line.project.id, line.project] as const] : [])).values());
  const showLineProjects = linkedProjects.length > 1;
  const customFieldDefinitions = listCustomFieldDefinitions(businessId, user.id, "sales_invoice");
  const customFieldValues = customFieldDefinitions.length
    ? getCustomFieldValuesForEntities(businessId, user.id, "sales_invoice", [invoiceId]).get(invoiceId) ?? {}
    : {};
  const emailContext = buildInvoiceEmailContext(access.business.name, record);
  const emailDefaults = buildInvoiceEmailDefaults(emailContext, emailContext.to);
  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <Link href={`/b/${businessId}/sales/invoices`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Sales Invoices</Link>
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="page-title tabular">{invoice.invoiceNumber}</h1><DocumentStatusBadge status={invoice.documentStatus} />{record.paymentStatus && <PaymentStatusBadge status={record.paymentStatus} />}</div><p className="mt-2 text-base font-medium">{customer.name}</p><p className="mt-1 text-sm text-muted-foreground">Invoice date: {formatDate(invoice.invoiceDate)} · Due: {formatDate(invoice.dueDate)}</p><div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1"><span className="money text-xl font-semibold">{formatMoney(invoice.totalMinor, currency)}</span>{invoice.documentStatus === "posted" ? <span className="money text-sm text-muted-foreground">Balance <strong className="font-semibold text-foreground">{formatMoney(record.balanceMinor, currency)}</strong></span> : <span className="text-sm text-muted-foreground">No ledger impact</span>}</div></div>
        <InvoiceViewActions businessId={businessId} invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} documentStatus={invoice.documentStatus} balanceMinor={record.balanceMinor} journalEntryId={record.journal?.id ?? null} inventoryEnabled={access.modules.includes("inventory")} hasDeliverableItems={lines.some((line) => Boolean(line.itemId) && line.remainingToDeliverMicros > 0)} eInvoiceLocked={eInvoiceLocked} emailDefaults={emailDefaults} />
      </div>
      {invoice.documentStatus === "posted" && <EInvoiceSourcePanel businessId={businessId} sourceType="sales_invoice" sourceId={invoiceId} document={eInvoice} />}
      {currency !== access.business.currency && <section aria-label="Currency snapshot" className="mb-5 rounded-lg border border-border bg-surface-raised p-4"><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Stored rate</dt><dd className="money mt-1">1 {currency} = {invoice.exchangeRateToBase} {access.business.currency}</dd></div><div><dt className="text-xs text-muted-foreground">Rate date</dt><dd className="mt-1">{formatDate(invoice.exchangeRateDate)}</dd></div><div><dt className="text-xs text-muted-foreground">Rate source</dt><dd className="mt-1">{invoice.exchangeRateSource}</dd></div><div><dt className="text-xs text-muted-foreground">Base equivalent</dt><dd className="money mt-1 font-semibold">{formatMoney(invoice.baseTotalMinor, access.business.currency)}</dd></div></dl><p className="mt-3 text-xs text-muted-foreground">Base VAT {formatMoney(invoice.baseTaxMinor, access.business.currency)} · Posted snapshots never follow later rate-table changes.</p></section>}
      <article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">
        <div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2"><div><p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Bill to</p><p className="mt-2 font-semibold">{customer.name}</p>{customer.email && <p className="mt-1 text-sm text-muted-foreground">{customer.email}</p>}{customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}</div><dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:justify-self-end"><dt className="text-muted-foreground">Invoice date</dt><dd className="text-right">{formatDate(invoice.invoiceDate)}</dd><dt className="text-muted-foreground">VAT tax date</dt><dd className="text-right">{formatDate(invoice.taxDate)}</dd><dt className="text-muted-foreground">Supply Emirate</dt><dd className="text-right">{invoice.supplyEmirate ? emirateLabels[invoice.supplyEmirate as Emirate] : "Business default"}</dd><dt className="text-muted-foreground">Due date</dt><dd className="text-right">{formatDate(invoice.dueDate)}</dd><dt className="text-muted-foreground">Reference</dt><dd className="text-right">{invoice.reference || "—"}</dd><dt className="text-muted-foreground">Project</dt><dd className="text-right"><ProjectLinks businessId={businessId} projects={linkedProjects} /></dd></dl></div>
        <div className="mt-6 overflow-x-auto"><table className={`data-table ${showLineProjects ? "min-w-[1020px]" : "min-w-[880px]"}`}><thead><tr><th>Item / Description</th><th className="text-right!">Qty</th><th className="text-right!">Delivered</th><th className="text-right!">Remaining</th><th className="text-right!">Rate</th><th>VAT</th>{showLineProjects && <th>Project</th>}<th className="text-right!">Amount</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td><span className="font-medium">{line.item ? `${line.item.sku ? `${line.item.sku} · ` : ""}${line.item.name}` : line.description}</span>{line.item && <span className="mt-0.5 block text-xs text-muted-foreground">{line.description}</span>}<span className="mt-0.5 block text-xs text-muted-foreground">{line.salesAccount ? `${line.salesAccount.code} ${line.salesAccount.name}` : "Sales account unavailable"}</span></td><td className="money text-right">{quantityMicrosToInput(line.quantityMicros)}</td><td className="money text-right">{line.item ? quantityMicrosToInput(line.deliveredMicros) : "—"}</td><td className="money text-right">{line.item ? quantityMicrosToInput(line.remainingToDeliverMicros) : "—"}</td><td className="money text-right">{formatMoney(line.unitPriceMinor, currency)}</td><td>{line.taxCode ? `${line.taxCode.name} (${rateBasisPointsToPercent(line.taxCode.rate_basis_points)}%)` : "—"}</td>{showLineProjects && <td><ProjectLinks businessId={businessId} projects={line.project ? [line.project] : []} empty="—" /></td>}<td className="money text-right">{formatMoney(line.grossAmountMinor, currency)}</td></tr>)}</tbody></table></div>
        <dl className="mt-6 ml-auto w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="money">{formatMoney(invoice.subtotalMinor, currency)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">VAT</dt><dd className="money">{formatMoney(invoice.taxMinor, currency)}</dd></div><div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="money">{formatMoney(invoice.totalMinor, currency)}</dd></div>{invoice.documentStatus === "posted" && <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Balance due</dt><dd className="money font-semibold">{formatMoney(record.balanceMinor, currency)}</dd></div>}</dl>
{customFieldDefinitions.length > 0 && (
  <section aria-label="Custom fields" className="mt-8 border-t border-border pt-5">
    <div className="flex items-center gap-2">
      <Tag className="size-4 text-muted-foreground" aria-hidden />
      <h2 className="text-sm font-semibold">Custom Fields</h2>
    </div>
    <dl className="mt-3 grid gap-x-8 gap-y-3 rounded-md border border-border bg-surface-muted/40 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {customFieldDefinitions.map((definition) => (
        <div key={definition.id} className="border-l-2 border-border-strong pl-3">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {definition.name}
          </dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatCustomFieldValue(definition.fieldType, customFieldValues[definition.id])}
          </dd>
        </div>
      ))}
    </dl>
  </section>
)}
        <section className="mt-8 border-t border-border pt-5"><h2 className="text-sm font-semibold">Related Credit Notes</h2>{record.creditNotes.length ? <div className="mt-3 overflow-x-auto rounded-md border border-border"><table className="data-table min-w-[560px]"><thead><tr><th>Credit note</th><th>Date</th><th>Status</th><th className="text-right!">Allocated</th></tr></thead><tbody>{record.creditNotes.map((note) => <tr key={note.id}><td><Link href={`/b/${businessId}/sales/credit-notes/${note.id}`} className="tabular font-medium text-primary hover:underline">{note.creditNoteNumber}</Link></td><td>{formatDate(note.date)}</td><td className="capitalize">{note.documentStatus}</td><td className="money text-right">{formatMoney(note.allocatedMinor, currency)}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-muted-foreground">No credit notes linked.</p>}</section>
        <section className="mt-8 border-t border-border pt-5"><h2 className="text-sm font-semibold">Delivery Notes</h2>{record.deliveryNotes.length ? <div className="mt-3 overflow-x-auto rounded-md border border-border"><table className="data-table min-w-[520px]"><thead><tr><th>Delivery</th><th>Date</th><th>Status</th></tr></thead><tbody>{record.deliveryNotes.map((delivery) => <tr key={delivery.id}><td><Link href={`/b/${businessId}/sales/delivery-notes/${delivery.id}`} className="tabular font-medium text-primary hover:underline">{delivery.delivery_number}</Link></td><td>{formatDate(delivery.date)}</td><td className="capitalize">{delivery.document_status}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-muted-foreground">No delivery notes linked yet.</p>}</section>
        <section className="mt-8 border-t border-border pt-5"><h2 className="text-sm font-semibold">Receipts</h2>{record.receipts.length ? <div className="mt-3 overflow-x-auto rounded-md border border-border"><table className="data-table min-w-[560px]"><thead><tr><th>Receipt</th><th>Date</th><th>Reference</th><th className="text-right!">Allocated</th></tr></thead><tbody>{record.receipts.map((receipt) => <tr key={receipt.id}><td><Link href={`/b/${businessId}/sales/receipts/${receipt.id}`} className="tabular font-medium text-primary hover:underline">{receipt.receiptNumber}</Link></td><td>{formatDate(receipt.date)}</td><td className="text-muted-foreground">{receipt.reference || "—"}</td><td className="money text-right">{formatMoney(receipt.allocatedMinor, currency)}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-muted-foreground">{invoice.documentStatus === "posted" ? "No receipts recorded." : "Receipts become available after posting."}</p>}</section>
      </article>
    </div>
  );
}
