import Link from "next/link";
import { notFound } from "next/navigation";
import { NoticeToast } from "@/components/notice-toast";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney, getCurrencyMinorUnit } from "@/core/format";
import { quantityMicrosToInput, rateBasisPointsToPercent } from "@/modules/accounting/calculations/money";
import { getDebitNote } from "@/modules/debit-notes/debit-note-service";
import { StatusBadge } from "@/components/status-badge";
import { DebitNoteViewActions } from "@/modules/debit-notes/debit-note-view-actions";
import { buildDocumentEmailContext, buildDocumentEmailDefaults } from "@/modules/email/email-defaults";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DocumentFlowStepper, type FlowStep } from "@/components/documents/document-flow-stepper";
import { getDocumentViewData } from "@/modules/document-templates/document-data-extractor";
import { DocumentViewLayout } from "@/modules/document-templates/components/document-view-layout";
import { getNoteCreditPanelData } from "@/modules/settlement/party-credit-service";
import { NoteCreditPanel } from "@/modules/settlement/note-credit-panel";
import { getBusinessTodayIso } from "@/core/format";

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
  const { note, lines, journal } = record;
  const currency = note.currencyCode;
  const currencyMinorUnit = getCurrencyMinorUnit(currency);
  const creditPanel = getNoteCreditPanelData(businessId, user.id, "supplier", debitNoteId);

  const flowSteps: FlowStep[] = [
    ...(note.purchaseInvoiceId
      ? [{
          key: "invoice",
          label: "Purchase Invoice",
          href: `/b/${businessId}/purchases/invoices/${note.purchaseInvoiceId}`,
          state: "completed" as const,
        }]
      : []),
    {
      key: "debit-note",
      label: "Debit Note",
      documentNumber: note.debitNoteNumber,
      statusLabel: note.documentStatus,
      state: "current" as const,
    },
    ...(journal
      ? [{
          key: "journal",
          label: "Journal",
          documentNumber: journal.entryNumber,
          href: `/b/${businessId}/accounting/journal/${journal.id}`,
          state: "completed" as const,
        }]
      : note.documentStatus !== "void"
        ? [{ key: "journal", label: "Journal", state: "pending" as const }]
        : []),
  ];

  const viewBundle = getDocumentViewData(
    businessId,
    user.id,
    access.business.name,
    access.business.currency,
    "debit-note",
    debitNoteId
  );

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
    note.supplierEmail ?? ""
  );
  const emailDefaults = buildDocumentEmailDefaults(emailContext, note.supplierEmail ?? "");

  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <Breadcrumbs
        businessId={businessId}
        items={[
          { label: "Debit Notes", href: `/b/${businessId}/purchases/debit-notes` },
          { label: note.debitNoteNumber },
        ]}
      />
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title tabular">{note.debitNoteNumber}</h1>
            <StatusBadge status={note.documentStatus} />
          </div>
          <p className="mt-2 text-base font-medium">
            <Link href={`/b/${businessId}/suppliers/${note.supplierId}`} className="hover:text-primary hover:underline transition-colors">
              {note.supplierName}
            </Link>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Debit Note date: {formatDate(note.debitNoteDate)}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="money text-xl font-semibold">{formatMoney(note.totalMinor, currency, currencyMinorUnit)}</span>
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
          journalEntryId={note.journalEntryId ?? null}
          emailDefaults={emailDefaults}
        />
      </div>
      {(Boolean(note.purchaseInvoiceId) || Boolean(journal)) && (
        <DocumentFlowStepper steps={flowSteps} className="no-print" />
      )}
      {creditPanel && (
        <div className="no-print">
          <NoteCreditPanel businessId={businessId} side="supplier" noteId={note.id} baseCurrencyCode={access.business.currency} today={getBusinessTodayIso()} {...creditPanel} />
        </div>
      )}

      <DocumentViewLayout
        data={viewBundle.data}
        settings={viewBundle.settings}
        variant={viewBundle.variant}
        pdfUrl={viewBundle.pdfUrl}
        documentNumber={note.debitNoteNumber}
      >
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
                <dd className="money mt-1 font-semibold">{formatMoney(note.baseTotalMinor, access.business.currency)}</dd>
              </div>
            </dl>
          </section>
        )}

        <article className="rounded-xl border border-border bg-surface-raised shadow-sm p-5 sm:p-7 dark:shadow-none">
          <div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2 -mx-5 -mt-5 bg-surface-muted/30 p-5 sm:-mx-7 sm:-mt-7 sm:p-7 rounded-t-xl">
            <div>
              <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Supplier</p>
              <p className="mt-2 font-semibold">
                <Link href={`/b/${businessId}/suppliers/${note.supplierId}`} className="hover:text-primary hover:underline transition-colors">
                  {note.supplierName}
                </Link>
              </p>
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
            <table className="data-table min-w-table-lg">
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
                        {line.expenseAccountName}
                      </span>
                    </td>
                    <td className="money text-right">{quantityMicrosToInput(line.quantityMicros)}</td>
                    <td className="money text-right">{formatMoney(line.unitPriceMinor, currency, currencyMinorUnit)}</td>
                    <td>{line.taxCodeName ? `${line.taxCodeName} (${rateBasisPointsToPercent(line.taxCodeRate)}%)` : "-"}</td>
                    <td className="money text-right">{formatMoney(line.grossAmountMinor, currency, currencyMinorUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-6 ml-auto w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="money">{formatMoney(note.subtotalMinor, currency, currencyMinorUnit)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="money">{formatMoney(note.taxMinor, currency, currencyMinorUnit)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="money">{formatMoney(note.totalMinor, currency, currencyMinorUnit)}</dd>
            </div>
          </dl>
        </article>
      </DocumentViewLayout>
    </div>
  );
}
