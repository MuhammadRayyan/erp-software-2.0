import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { SalesQuoteForm } from "@/modules/sales-quotes/quote-form";
import { getSalesQuote } from "@/modules/sales-quotes/quote-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function EditQuotePage({ params }: { params: Promise<{ businessId: string; quoteId: string }> }) {
  const { businessId, quoteId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const record = getSalesQuote(businessId, user.id, quoteId);
  if (!record) notFound();
  if (record.quote.documentStatus === "cancelled") {
    return <div className="page-container"><h1 className="page-title">Cancelled quote</h1><p className="page-description">Cancelled quotes are retained for history and cannot be edited.</p><Button asChild className="mt-5"><Link href={`/b/${businessId}/sales/quotes/${quoteId}`}>Return to quote</Link></Button></div>;
  }
  const customers = listCustomers(businessId, user.id);
  const salesAccounts = getSalesAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["sales", "both"].includes(code.direction));
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const documentMinorUnit = currencySettings.currencies.find((entry) => entry.code === record.quote.currencyCode)?.minor_unit ?? 2;
  const customFields = listCustomFieldDefinitions(businessId, user.id, "sales_quote").map(({ id, name, fieldType, selectOptions, isRequired }) => ({ id, name, fieldType, selectOptions, isRequired }));
  const customFieldValues = customFields.length
    ? getCustomFieldValuesForEntities(businessId, user.id, "sales_quote", [quoteId]).get(quoteId) ?? {}
    : {};
  return <div className="page-container">
    <Link href={`/b/${businessId}/sales/quotes/${quoteId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {record.quote.quoteNumber}</Link>
    <div className="mb-7"><h1 className="page-title">Edit Sales Quote</h1><p className="page-description">{["sent", "accepted"].includes(record.quote.documentStatus) ? "Changes will be saved as a new revision." : "Update the draft, or issue it when ready."}</p></div>
    <SalesQuoteForm
      businessId={businessId}
      quoteId={quoteId}
      status={record.quote.documentStatus as any}
      customers={customers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
      salesAccounts={salesAccounts.map(({ id, code, name }) => ({ id, code, name }))}
      taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
      projects={projects.map((project) => ({ id: project.id, code: project.code, name: project.name, customerId: project.customer_id }))}
      items={items.map(({ id, sku, name, salesPriceMinor, salesAccountId }) => ({ id, sku, name, salesPriceMinor, salesAccountId }))}
      currency={access.business.currency}
      currencies={currencySettings.currencies.filter((entry) => entry.is_active || entry.code === record.quote.currencyCode).map((entry) => ({ code: entry.code, name: entry.name, minorUnit: entry.minor_unit }))}
      rates={currencySettings.rates.map((entry) => ({ id: entry.id, currencyCode: entry.currency_code, rateDate: entry.rate_date, rateToBase: entry.rate_to_base, source: entry.source, sourceReference: entry.source_reference }))}
      initial={{
        currencyCode: record.quote.currencyCode,
        exchangeRateToBase: record.quote.exchangeRateToBase,
        exchangeRateDate: record.quote.exchangeRateDate,
        exchangeRateSource: record.quote.exchangeRateSource as "Base" | "Manual" | "CBUAE",
        customerId: record.quote.customerId,
        projectId: record.quote.projectId ?? "",
        date: record.quote.quoteDate,
        expectedDate: record.quote.expiryDate ?? "",
        reference: record.quote.reference ?? "",
        notes: record.quote.notes ?? "",
        terms: record.quote.terms ?? "",
        amountsIncludeTax: record.quote.amountsIncludeTax ?? false,
        lines: record.lines.map((line) => ({ itemId: line.itemId ?? "", description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit), discountType: line.discountType ?? "none", discountValue: line.discountValue ?? "0", salesAccountId: line.salesAccountId ?? "", taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })),
      }}
    />
  </div>;
}
