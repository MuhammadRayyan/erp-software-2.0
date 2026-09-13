import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { NoticeToast } from "@/components/notice-toast";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { quantityMicrosToInput, rateBasisPointsToPercent } from "@/modules/accounting/calculations/money";
import { getDebitNote } from "@/modules/debit-notes/debit-note-service";
import { StatusBadge } from "@/components/status-badge";
import { DebitNoteViewActions } from "@/modules/debit-notes/debit-note-view-actions";
import { buildDocumentEmailContext, buildDocumentEmailDefaults } from "@/modules/email/email-defaults";

export default async function DebitNoteViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; debitNoteId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { businessId, debitNoteId } = await params;
  const { notice } = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");
  const record = getDebitNote(businessId, user.id, debitNoteId);
  if (!record) notFound();
  const { note, lines } = record;
  const currency = note.currencyCode;

  const emailContext = buildDocumentEmailContext(
    access.business.name,
    "Debit Note",
    {
      currencyCode: note.currencyCode,
      documentNumber: note.debitNoteNumber,
      documentDate: note.debitNoteDate,
      dueDate: "-",
      partyName: note.supplierName,
      totalMinor: note.totalMinor,
    },
    (note as any).supplierEmail ?? ""
  );
  const emailDefaults = buildDocumentEmailDefaults(emailContext, (note as any).supplierEmail ?? "");

  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <Link
        href={`/b/${businessId}/purchases/debit-notes`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Debit Notes
      </Link>
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title tabular">{note.debitNoteNumber}</h1>
            <StatusBadge status={note.documentStatus} />
          </div>
          <p className="mt-2 text-base font-medium">{note.supplierName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Debit Note date: {formatDate(note.debitNoteDate)}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="money text-xl font-semibold">{formatMoney(note.totalMinor, currency)}</span>
            {note.documentStatus !== "posted" && (
              <span className="text-sm text-muted-foreground">No ledger impact</span>
            )}
          </div>
        </div>
        <DebitNoteViewActions
          businessId={businessId}
          noteId={note.id}
          debitNoteNumber={note.debitNoteNumber}
          documentStatus={note.documentStatus}
          journalEntryId={null}
          emailDefaults={emailDefaults}
        />
      </div>

      {currency !== access.business.currency && (
        <section aria-label="Currency snapshot" className="mb-5 rounded-lg border border-border bg-surface-raised p-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Stored rate</dt>
              <dd className="money mt-1">1 {currency} = {note.exchangeRateToBase} {access.business.currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Rate date</dt>
              <dd className="mt-1">{formatDate(note.exchangeRateDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Rate source</dt>
              <dd className="mt-1">{note.exchangeRateSource}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Base equivalent</dt>
              <dd className="money mt-1 font-semibold">{formatMoney(note.totalMinor, access.business.currency)}</dd>
            </div>
          </dl>
        </section>
      )}

      <article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">
        <div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Supplier</p>
            <p className="mt-2 font-semibold">{note.supplierName}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:justify-self-end">
            <dt className="text-muted-foreground">Debit note date</dt>
            <dd className="text-right">{formatDate(note.debitNoteDate)}</dd>
            <dt className="text-muted-foreground">VAT tax date</dt>
            <dd className="text-right">{formatDate(note.taxDate)}</dd>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="text-right">{note.reference || "-"}</dd>
          </dl>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="data-table min-w-[700px]">
            <thead>
              <tr>
                <th>Description</th>
                <th className="text-right!">Qty</th>
                <th className="text-right!">Rate</th>
                <th>VAT</th>
                <th className="text-right!">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <span className="font-medium">{line.description}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {line.expenseAccountCode} {line.expenseAccountName}
                    </span>
                  </td>
                  <td className="money text-right">{quantityMicrosToInput(line.quantityMicros)}</td>
                  <td className="money text-right">{formatMoney(line.unitPriceMinor, currency)}</td>
                  <td>{line.taxCodeName ? `${line.taxCodeName} (${rateBasisPointsToPercent(line.taxCodeRate)}%)` : "-"}</td>
                  <td className="money text-right">{formatMoney(line.grossAmountMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-6 ml-auto w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="money">{formatMoney(note.subtotalMinor, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT</dt>
            <dd className="money">{formatMoney(note.taxMinor, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="money">{formatMoney(note.totalMinor, currency)}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}
