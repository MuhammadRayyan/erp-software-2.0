import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { getEInvoiceForSource } from "@/modules/einvoicing/einvoice-service";
import { normalizeCreditNoteReasonCode, parseTransactionFlags } from "@/modules/einvoicing/einvoice-types";
import { listProjectOptions } from "@/modules/projects/project-service";
import { CreditNoteForm } from "@/modules/sales-credit-notes/credit-note-form";
import { getCreditNote, getRemainingInvoiceBalance } from "@/modules/sales-credit-notes/credit-note-service";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function EditCreditNotePage({ params }: { params: Promise<{ businessId: string; creditNoteId: string }> }) {
  const { businessId, creditNoteId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const record = getCreditNote(businessId, user.id, creditNoteId);
  if (!record || record.note.documentStatus === "void") notFound();
  const eInvoice = getEInvoiceForSource(businessId, user.id, "sales_credit_note", creditNoteId);
  if (eInvoice && ["Submitted", "Accepted", "Rejected"].includes(eInvoice.status)) {
    return <div className="page-container page-narrow"><h1 className="page-title">Submitted eInvoice snapshot</h1><p className="page-description">This Sales Credit Note cannot be rewritten after eInvoice submission. Create a new correction document if another adjustment is required.</p><Button asChild className="mt-5"><Link href={`/b/${businessId}/sales/credit-notes/${creditNoteId}`}>Return to credit note</Link></Button></div>;
  }
  const customers = listCustomers(businessId, user.id);
  const invoices = listInvoices(businessId, user.id)
    .filter((invoice) => invoice.documentStatus === "posted" && (invoice.balanceMinor > 0 || invoice.id === record.note.sourceInvoiceId))
    .map((invoice) => ({ ...invoice, balanceMinor: invoice.id === record.note.sourceInvoiceId ? getRemainingInvoiceBalance(businessId, user.id, invoice.id, creditNoteId) : invoice.balanceMinor }));
  const accounts = getSalesAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["sales", "both"].includes(code.direction));
  const projects = listProjectOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const minorUnits = new Map(currencySettings.currencies.map((currency) => [currency.code, currency.minor_unit]));
  return <div className="page-container page-wide">
    <Link href={`/b/${businessId}/sales/credit-notes/${creditNoteId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {record.note.creditNoteNumber}</Link>
    <div className="mb-7"><h1 className="page-title">Edit Sales Credit Note</h1><p className="page-description">{record.note.documentStatus === "posted" ? "Financial changes rebuild the journal and invalidate any unsubmitted eInvoice snapshot atomically." : "Update the draft, or post it when ready."}</p></div>
    <CreditNoteForm
      businessId={businessId}
      noteId={creditNoteId}
      documentStatus={record.note.documentStatus}
      customers={customers.map(({ id, name }) => ({ id, name }))}
      invoices={invoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, balanceMinor: invoice.balanceMinor, currencyCode: invoice.currencyCode, minorUnit: minorUnits.get(invoice.currencyCode) ?? 2, exchangeRateToBase: invoice.exchangeRateToBase, exchangeRateDate: invoice.exchangeRateDate, exchangeRateSource: invoice.exchangeRateSource }))}
      salesAccounts={accounts.map(({ id, code, name }) => ({ id, code, name }))}
      taxCodes={taxes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
      projects={projects.map((project) => ({ id: project.id, code: project.code, name: project.name, customerId: project.customer_id }))}
      currency={access.business.currency}
      initial={{
        currencyCode: record.note.currencyCode,
        exchangeRateToBase: record.note.exchangeRateToBase,
        exchangeRateDate: record.note.exchangeRateDate,
        exchangeRateSource: record.note.exchangeRateSource as "Base" | "Manual" | "CBUAE",
        customerId: record.note.customerId,
        projectId: record.note.projectId ?? "",
        sourceInvoiceId: record.note.sourceInvoiceId,
        date: record.note.date,
        taxDate: record.note.taxDate,
        supplyEmirate: record.note.supplyEmirate ?? "",
        reference: record.note.reference ?? "",
        reason: record.note.reason ?? "",
        eInvoiceReasonCode: normalizeCreditNoteReasonCode(record.note.eInvoiceReasonCode),
        eInvoiceTransactionFlags: parseTransactionFlags(record.note.eInvoiceTransactionFlagsJson),
        lines: record.lines.map((line) => ({ description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnits.get(record.note.currencyCode) ?? 2), salesAccountId: line.salesAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })),
      }}
    />
  </div>;
}
