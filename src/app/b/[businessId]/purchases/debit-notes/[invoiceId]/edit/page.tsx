import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listPurchaseInvoices } from "@/modules/purchase-invoices/purchase-invoice-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { DebitNoteForm } from "@/modules/debit-notes/debit-note-form";
import { getDebitNote } from "@/modules/debit-notes/debit-note-service";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function EditDebitNotePage({
  params,
}: {
  params: Promise<{ businessId: string; invoiceId: string }>;
}) {
  const { businessId, invoiceId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const record = getDebitNote(businessId, user.id, invoiceId);
  if (!record) notFound();
  if (record.note.documentStatus === "void") {
    return (
      <div className="page-container">
        <h1 className="page-title">Void Debit Note</h1>
        <p className="page-description">Void debit notes are retained for history and cannot be edited.</p>
        <Button asChild className="mt-5">
          <Link href={`/b/${businessId}/purchases/debit-notes/${invoiceId}`}>Return to Debit Note</Link>
        </Button>
      </div>
    );
  }

  const suppliers = listActiveSuppliers(businessId, user.id);
  const expenseAccounts = getExpenseAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter(
    (code) => code.vatCategory && ["purchases", "both"].includes(code.direction),
  );
  const projects = listProjectOptions(businessId, user.id);
  const allInvoices = listPurchaseInvoices(businessId, user.id);
  const eligibleInvoices = allInvoices.filter((inv) => inv.document_status === "posted");
  const currencySettings = getCurrencySettings(businessId, user.id);
  const documentMinorUnit =
    currencySettings.currencies.find((entry) => entry.code === record.note.currencyCode)?.minor_unit ?? 2;

  return (
    <div className="page-container">
      <Link
        href={`/b/${businessId}/purchases/debit-notes/${invoiceId}`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {record.note.debitNoteNumber}
      </Link>
      <div className="mb-7">
        <h1 className="page-title">Edit Debit Note</h1>
        <p className="page-description">
          {record.note.documentStatus === "posted"
            ? "Financial changes rebuild the journal atomically."
            : "Update the draft, or post it when ready."}
        </p>
      </div>
      <DebitNoteForm
        businessId={businessId}
        noteId={invoiceId}
        documentStatus={record.note.documentStatus}
        suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
        invoices={eligibleInvoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.internal_number,
          supplierId: inv.supplier_id,
          balanceMinor: inv.total_minor,
          currencyCode: inv.currency_code,
          minorUnit: 2,
          exchangeRateToBase: String(inv.exchange_rate_to_base ?? "1"),
          exchangeRateDate: inv.exchange_rate_date ?? "",
          exchangeRateSource: inv.exchange_rate_source ?? "Base",
        }))}
        salesAccounts={expenseAccounts.map(({ id, code, name }) => ({ id, code, name }))}
        taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
        projects={projects.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          supplierId: null,
        }))}
        currency={access.business.currency}
        initial={{
          currencyCode: record.note.currencyCode,
          exchangeRateToBase: record.note.exchangeRateToBase,
          exchangeRateDate: record.note.exchangeRateDate,
          exchangeRateSource: record.note.exchangeRateSource as "Base" | "Manual" | "CBUAE",
          supplierId: record.note.supplierId,
          projectId: record.note.projectId ?? "",
          purchaseInvoiceId: record.note.purchaseInvoiceId ?? "",
          amountsIncludeTax: record.note.amountsIncludeTax,
          date: record.note.debitNoteDate,
          taxDate: record.note.taxDate,
          reference: record.note.reference ?? "",
          lines: record.lines.map((line) => ({
            description: line.description,
            quantity: quantityMicrosToInput(line.quantityMicros),
            unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit),
            discountType: line.discountType,
            discountValue: line.discountValue || "0",
            expenseAccountId: line.expenseAccountId,
            taxCodeId: line.taxCodeId,
            projectId: line.projectId ?? "",
          })),
        }}
      />
    </div>
  );
}
