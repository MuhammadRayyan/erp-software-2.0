import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { NoticeToast } from "@/components/notice-toast";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput, rateBasisPointsToPercent } from "@/modules/accounting/calculations/money";
import { getCreditNote } from "@/modules/sales-credit-notes/credit-note-service";
import { CreditNoteViewActions } from "@/modules/sales-credit-notes/credit-note-view-actions";
import { emirateLabels, type Emirate } from "@/modules/tax/uae-vat-config";
import { getEInvoiceForSource } from "@/modules/einvoicing/einvoice-service";
import { EInvoiceSourcePanel } from "@/modules/einvoicing/source-panel";

export default async function CreditNoteViewPage({ params, searchParams }: { params: Promise<{ businessId: string; creditNoteId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { businessId, creditNoteId } = await params;
  const { notice } = await searchParams;
  const { user, access } = await requireModule(businessId, "sales");
  const record = getCreditNote(businessId, user.id, creditNoteId);
  if (!record) notFound();
  const { note, customer, invoice, lines } = record;
  const currency = note.currencyCode;
  const eInvoice = note.documentStatus === "posted" ? getEInvoiceForSource(businessId, user.id, "sales_credit_note", creditNoteId) : null;
  const eInvoiceLocked = Boolean(eInvoice && ["Submitted", "Accepted", "Rejected"].includes(eInvoice.status));
  const linkedProjects = Array.from(new Map(lines.filter((line) => line.project).map((line) => [line.project!.id, line.project!] as const)).values());
  return <div className="page-container">
    <NoticeToast message={notice} />
    <Link href={`/b/${businessId}/sales/credit-notes`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Sales Credit Notes</Link>
    <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="page-title tabular">{note.creditNoteNumber}</h1><StatusBadge status={note.documentStatus} /></div>
        <p className="mt-2 text-base font-medium">{customer.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">Credit date: {formatDate(note.date)} · Applied to <Link className="tabular text-primary hover:underline" href={`/b/${businessId}/sales/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></p>
        {linkedProjects.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Project: {linkedProjects.map((project, index) => <span key={project.id}>{index > 0 && ", "}<Link className="font-medium text-primary hover:underline" href={`/b/${businessId}/projects/${project.id}`}>{project.code} · {project.name}</Link></span>)}</p>}
        <div className="mt-3 flex items-baseline gap-4"><span className="money text-xl font-semibold">{formatMoney(note.totalMinor, currency)}</span><span className="text-sm text-muted-foreground">{note.documentStatus === "posted" ? "Reduces Accounts Receivable" : "No ledger impact"}</span></div>
      </div>
      <CreditNoteViewActions businessId={businessId} noteId={note.id} creditNoteNumber={note.creditNoteNumber} documentStatus={note.documentStatus} journalEntryId={record.journal?.id ?? null} eInvoiceLocked={eInvoiceLocked} />
    </div>
    {note.documentStatus === "posted" && <EInvoiceSourcePanel businessId={businessId} sourceType="sales_credit_note" sourceId={creditNoteId} document={eInvoice} />}
    {currency !== access.business.currency && <section aria-label="Currency snapshot" className="mb-5 rounded-lg border border-border bg-surface-raised p-4"><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Inherited rate</dt><dd className="money mt-1">1 {currency} = {note.exchangeRateToBase} {access.business.currency}</dd></div><div><dt className="text-xs text-muted-foreground">Rate date</dt><dd className="mt-1">{formatDate(note.exchangeRateDate)}</dd></div><div><dt className="text-xs text-muted-foreground">Rate source</dt><dd className="mt-1">{note.exchangeRateSource}</dd></div><div><dt className="text-xs text-muted-foreground">Base reduction</dt><dd className="money mt-1 font-semibold">{formatMoney(note.baseTotalMinor, access.business.currency)}</dd></div></dl><p className="mt-3 text-xs text-muted-foreground">The linked invoice snapshot is reused, avoiding an artificial FX difference.</p></section>}
    <article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">
      <div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2">
        <div><p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Credit to</p><p className="mt-2 font-semibold">{customer.name}</p>{customer.email && <p className="mt-1 text-sm text-muted-foreground">{customer.email}</p>}</div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:justify-self-end"><dt className="text-muted-foreground">Credit date</dt><dd className="text-right">{formatDate(note.date)}</dd><dt className="text-muted-foreground">VAT tax date</dt><dd className="text-right">{formatDate(note.taxDate)}</dd><dt className="text-muted-foreground">Supply Emirate</dt><dd className="text-right">{note.supplyEmirate ? emirateLabels[note.supplyEmirate as Emirate] : "Business default"}</dd><dt className="text-muted-foreground">Source invoice</dt><dd className="text-right"><Link href={`/b/${businessId}/sales/invoices/${invoice.id}`} className="tabular text-primary hover:underline">{invoice.invoiceNumber}</Link></dd><dt className="text-muted-foreground">Reference</dt><dd className="text-right">{note.reference || "—"}</dd><dt className="text-muted-foreground">Reason</dt><dd className="max-w-72 text-right">{note.reason || "—"}</dd></dl>
      </div>
      <div className="mt-6 overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Description</th><th>Project</th><th className="text-right!">Qty</th><th className="text-right!">Rate</th><th>VAT</th><th className="text-right!">Amount</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}>
        <td><span className="font-medium">{line.description}</span><span className="mt-0.5 block text-xs text-muted-foreground">{line.salesAccount ? `${line.salesAccount.code} ${line.salesAccount.name}` : "Sales account unavailable"}</span></td>
        <td>{line.project ? <Link href={`/b/${businessId}/projects/${line.project.id}`} className="text-primary hover:underline">{line.project.name}</Link> : <span className="text-muted-foreground">—</span>}</td>
        <td className="money text-right">{quantityMicrosToInput(line.quantityMicros)}</td><td className="money text-right">{formatMoney(line.unitPriceMinor, currency)}</td><td>{line.taxCode ? `${line.taxCode.name} (${rateBasisPointsToPercent(line.taxCode.rate_basis_points)}%)` : "—"}</td><td className="money text-right">{formatMoney(line.grossAmountMinor, currency)}</td>
      </tr>)}</tbody></table></div>
      <dl className="mt-6 ml-auto w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="money">{formatMoney(note.subtotalMinor, currency)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">VAT reversal</dt><dd className="money">{formatMoney(note.taxMinor, currency)}</dd></div><div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total credit</dt><dd className="money">{formatMoney(note.totalMinor, currency)}</dd></div></dl>
      <section className="mt-8 border-t border-border pt-5"><h2 className="text-sm font-semibold">Related</h2><div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm"><Link href={`/b/${businessId}/sales/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">Invoice {invoice.invoiceNumber}</Link>{linkedProjects.map((project) => <Link key={project.id} href={`/b/${businessId}/projects/${project.id}`} className="font-medium text-primary hover:underline">Project {project.code}</Link>)}{record.journal && <Link href={`/b/${businessId}/accounting/journal/${record.journal.id}`} className="font-medium text-primary hover:underline">Journal {record.journal.entryNumber}</Link>}</div></section>
    </article>
  </div>;
}
