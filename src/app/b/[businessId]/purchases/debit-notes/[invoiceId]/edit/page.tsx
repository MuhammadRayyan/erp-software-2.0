// @ts-nocheck
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getPurchaseAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { getEDebitNoteForSource } from "@/modules/einvoicing/edebitNote-service";
import { parseTransactionFlags } from "@/modules/einvoicing/edebitNote-types";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { DebitNoteForm } from "@/modules/purchase-debit-notes/debitNote-form";
import { getDebitNote } from "@/modules/purchase-debit-notes/debitNote-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function EditDebitNotePage({ params }: { params: Promise<{ businessId: string; debitNoteId: string }> }) {
  const { businessId, debitNoteId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const record = getDebitNote(businessId, user.id, debitNoteId);
  if (!record) notFound();
  if (record.debitNote.documentStatus === "void") {
    return <div className="page-container"><h1 className="page-title">Void debitNote</h1><p className="page-description">Void debitNotes are retained for history and cannot be edited.</p><Button asChild className="mt-5"><Link href={`/b/${businessId}/purchases/debit-notes/${debitNoteId}`}>Return to debitNote</Link></Button></div>;
  }
  const eDebitNote = getEDebitNoteForSource(businessId, user.id, "purchases_debitNote", debitNoteId);
  if (eDebitNote && ["Submitted", "Accepted", "Rejected"].includes(eDebitNote.status)) {
    return <div className="page-container"><h1 className="page-title">Submitted eDebitNote snapshot</h1><p className="page-description">This source is immutable after submission. For an accepted debitNote, create a Purchase Credit Note to correct the accounting and eDebitNote trail.</p><div className="mt-5 flex gap-2"><Button asChild><Link href={`/b/${businessId}/purchases/debit-notes/${debitNoteId}`}>Return to debitNote</Link></Button>{eDebitNote.status === "Accepted" && record.balanceMinor > 0 && <Button asChild variant="secondary"><Link href={`/b/${businessId}/purchases/credit-notes/new?debitNoteId=${debitNoteId}`}>Create Credit Note</Link></Button>}</div></div>;
  }
  const customers = listCustomers(businessId, user.id);
  const purchasesAccounts = getPurchaseAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["purchases", "both"].includes(code.direction));
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const documentMinorUnit = currencySettings.currencies.find((entry) => entry.code === record.debitNote.currencyCode)?.minor_unit ?? 2;
  const customFields = listCustomFieldDefinitions(businessId, user.id, "purchases_debitNote").map(({ id, name, fieldType, selectOptions, isRequired }) => ({ id, name, fieldType, selectOptions, isRequired }));
  const customFieldValues = customFields.length
    ? getCustomFieldValuesForEntities(businessId, user.id, "purchases_debitNote", [debitNoteId]).get(debitNoteId) ?? {}
    : {};
  return <div className="page-container">
    <Link href={`/b/${businessId}/purchases/debit-notes/${debitNoteId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {record.debitNote.debitNoteNumber}</Link>
    <div className="mb-7"><h1 className="page-title">Edit Debit Note</h1><p className="page-description">{record.debitNote.documentStatus === "posted" ? "Financial changes rebuild the journal and invalidate any unsubmitted eDebitNote snapshot atomically." : "Update the draft, or post it when ready."}</p></div>
    <DebitNoteForm
      businessId={businessId}
      debitNoteId={debitNoteId}
      documentStatus={record.debitNote.documentStatus}
      customFields={customFields}
      customFieldValues={customFieldValues}
      customers={customers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
      purchasesAccounts={purchasesAccounts.map(({ id, code, name }) => ({ id, code, name }))}
      taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
      projects={projects.map((project) => ({ id: project.id, code: project.code, name: project.name, customerId: project.customer_id }))}
      items={items.map(({ id, sku, name, purchasesPriceMinor, purchasesAccountId }) => ({ id, sku, name, purchasesPriceMinor, purchasesAccountId }))}
      currency={access.business.currency}
      currencies={currencySettings.currencies.filter((entry) => entry.is_active || entry.code === record.debitNote.currencyCode).map((entry) => ({ code: entry.code, name: entry.name, minorUnit: entry.minor_unit }))}
      rates={currencySettings.rates.map((entry) => ({ id: entry.id, currencyCode: entry.currency_code, rateDate: entry.rate_date, rateToBase: entry.rate_to_base, source: entry.source, sourceReference: entry.source_reference }))}
      initial={{
        currencyCode: record.debitNote.currencyCode,
        exchangeRateToBase: record.debitNote.exchangeRateToBase,
        exchangeRateDate: record.debitNote.exchangeRateDate,
        exchangeRateSource: record.debitNote.exchangeRateSource as "Base" | "Manual" | "CBUAE",
        customerId: record.debitNote.customerId,
        projectId: record.debitNote.projectId ?? "",
        debitNoteDate: record.debitNote.debitNoteDate,
        taxDate: record.debitNote.taxDate,
        supplyEmirate: record.debitNote.supplyEmirate ?? "",
        dueDate: record.debitNote.dueDate,
        reference: record.debitNote.reference ?? "",
        eDebitNoteTransactionFlags: parseTransactionFlags(record.debitNote.eDebitNoteTransactionFlagsJson),
        lines: record.lines.map((line) => ({ itemId: line.itemId ?? "", description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit), purchasesAccountId: line.purchasesAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })),
      }}
    />
  </div>;
}
