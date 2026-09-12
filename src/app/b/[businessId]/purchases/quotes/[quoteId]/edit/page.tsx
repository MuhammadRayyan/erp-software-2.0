import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { getPurchaseQuote } from "@/modules/purchase-quotes/purchase-quote-service";
import { PurchaseQuoteForm } from "@/modules/purchase-quotes/purchase-quote-form";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { minorToCurrencyInput } from "@/modules/currency/conversion";

export default async function EditPurchaseQuotePage({
  params,
}: {
  params: Promise<{ businessId: string; quoteId: string }>;
}) {
  const { businessId, quoteId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const record = getPurchaseQuote(businessId, user.id, quoteId);
  if (!record) notFound();
  if (["accepted", "cancelled", "superseded"].includes(record.quote.documentStatus)) notFound();

  const suppliers = listActiveSuppliers(businessId, user.id);
  const accounts = getExpenseAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter(
    (tax) => ["purchases", "both"].includes(tax.direction) && tax.vatCategory,
  );
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const minorUnit =
    currencySettings.currencies.find((c) => c.code === record.quote.currencyCode)?.minor_unit ?? 2;

  return (
    <div className="page-container">
      <Link
        href={`/b/${businessId}/purchases/quotes/${quoteId}`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {record.quote.quoteNumber}
      </Link>
      <div className="mb-7">
        <h1 className="page-title">Edit Purchase Quote</h1>
        <p className="page-description">Updates remain operational and do not affect the ledger.</p>
      </div>
      <PurchaseQuoteForm
        businessId={businessId}
        quoteId={quoteId}
        status={record.quote.documentStatus}
        suppliers={suppliers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
        expenseAccounts={accounts.map(({ id, code, name }) => ({ id, code, name }))}
        taxCodes={taxes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
        projects={projects}
        items={items.map(({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }) => ({
          id,
          sku,
          name,
          purchasePriceMinor,
          inventoryAssetAccountId,
        }))}
        currency={access.business.currency}
        currencies={currencySettings.currencies
          .filter((currency) => currency.is_active || currency.code === record.quote.currencyCode)
          .map((currency) => ({ code: currency.code, name: currency.name, minorUnit: currency.minor_unit }))}
        rates={currencySettings.rates.map((rate) => ({
          id: rate.id,
          currencyCode: rate.currency_code,
          rateDate: rate.rate_date,
          rateToBase: rate.rate_to_base,
          source: rate.source,
          sourceReference: rate.source_reference,
        }))}
        initial={{
          currencyCode: record.quote.currencyCode,
          exchangeRateToBase: record.quote.exchangeRateToBase,
          exchangeRateDate: record.quote.exchangeRateDate,
          exchangeRateSource: record.quote.exchangeRateSource as any,
          supplierId: record.quote.supplierId,
          projectId: record.quote.projectId ?? "",
          date: record.quote.quoteDate,
          expiryDate: record.quote.expiryDate ?? "",
          reference: record.quote.reference ?? "",
          notes: record.quote.notes ?? "",
          terms: record.quote.terms ?? "",
          amountsIncludeTax: record.quote.amountsIncludeTax,
          lines: record.lines.map((line) => ({
            itemId: line.itemId ?? "",
            description: line.description,
            quantity: quantityMicrosToInput(line.quantityMicros),
            unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit),
            discountType: (line.discountType as any) ?? "none",
            discountValue: line.discountValue ?? "0",
            expenseAccountId: line.expenseAccountId ?? "",
            taxCodeId: line.taxCodeId,
            projectId: line.projectId ?? "",
          })),
        }}
      />
    </div>
  );
}
