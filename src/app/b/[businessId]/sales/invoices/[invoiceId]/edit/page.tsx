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
import { parseTransactionFlags } from "@/modules/einvoicing/einvoice-types";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { InvoiceForm } from "@/modules/sales-invoices/invoice-form";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function EditInvoicePage({ params }: { params: Promise<{ businessId: string; invoiceId: string }> }) {
  const { businessId, invoiceId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const record = getInvoice(businessId, user.id, invoiceId);
  if (!record) notFound();
  if (record.invoice.documentStatus === "void") {
    return <div className="page-container max-w-[760px]"><h1 className="page-title">Void invoice</h1><p className="page-description">Void invoices are retained for history and cannot be edited.</p><Button asChild className="mt-5"><Link href={`/b/${businessId}/sales/invoices/${invoiceId}`}>Return to invoice</Link></Button></div>;
  }
  const eInvoice = getEInvoiceForSource(businessId, user.id, "sales_invoice", invoiceId);
  if (eInvoice && ["Submitted", "Accepted", "Rejected"].includes(eInvoice.status)) {
    return <div className="page-container max-w-[760px]"><h1 className="page-title">Submitted eInvoice snapshot</h1><p className="page-description">This source is immutable after submission. For an accepted invoice, create a Sales Credit Note to correct the accounting and eInvoice trail.</p><div className="mt-5 flex gap-2"><Button asChild><Link href={`/b/${businessId}/sales/invoices/${invoiceId}`}>Return to invoice</Link></Button>{eInvoice.status === "Accepted" && record.balanceMinor > 0 && <Button asChild variant="secondary"><Link href={`/b/${businessId}/sales/credit-notes/new?invoiceId=${invoiceId}`}>Create Credit Note</Link></Button>}</div></div>;
  }
  const customers = listCustomers(businessId, user.id);
  const salesAccounts = getSalesAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["sales", "both"].includes(code.direction));
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const documentMinorUnit = currencySettings.currencies.find((entry) => entry.code === record.invoice.currencyCode)?.minor_unit ?? 2;
  return <div className="page-container max-w-[1320px]">
    <Link href={`/b/${businessId}/sales/invoices/${invoiceId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {record.invoice.invoiceNumber}</Link>
    <div className="mb-7"><h1 className="page-title">Edit Sales Invoice</h1><p className="page-description">{record.invoice.documentStatus === "posted" ? "Financial changes rebuild the journal and invalidate any unsubmitted eInvoice snapshot atomically." : "Update the draft, or post it when ready."}</p></div>
    <InvoiceForm
      businessId={businessId}
      invoiceId={invoiceId}
      documentStatus={record.invoice.documentStatus}
      customers={customers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
      salesAccounts={salesAccounts.map(({ id, code, name }) => ({ id, code, name }))}
      taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
      projects={projects.map((project) => ({ id: project.id, code: project.code, name: project.name, customerId: project.customer_id }))}
      items={items.map(({ id, sku, name, salesPriceMinor, salesAccountId }) => ({ id, sku, name, salesPriceMinor, salesAccountId }))}
      currency={access.business.currency}
      currencies={currencySettings.currencies.filter((entry) => entry.is_active || entry.code === record.invoice.currencyCode).map((entry) => ({ code: entry.code, name: entry.name, minorUnit: entry.minor_unit }))}
      rates={currencySettings.rates.map((entry) => ({ id: entry.id, currencyCode: entry.currency_code, rateDate: entry.rate_date, rateToBase: entry.rate_to_base, source: entry.source, sourceReference: entry.source_reference }))}
      initial={{
        currencyCode: record.invoice.currencyCode,
        exchangeRateToBase: record.invoice.exchangeRateToBase,
        exchangeRateDate: record.invoice.exchangeRateDate,
        exchangeRateSource: record.invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
        customerId: record.invoice.customerId,
        projectId: record.invoice.projectId ?? "",
        invoiceDate: record.invoice.invoiceDate,
        taxDate: record.invoice.taxDate,
        supplyEmirate: record.invoice.supplyEmirate ?? "",
        dueDate: record.invoice.dueDate,
        reference: record.invoice.reference ?? "",
        eInvoiceTransactionFlags: parseTransactionFlags(record.invoice.eInvoiceTransactionFlagsJson),
        lines: record.lines.map((line) => ({ itemId: line.itemId ?? "", description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit), salesAccountId: line.salesAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })),
      }}
    />
  </div>;
}
