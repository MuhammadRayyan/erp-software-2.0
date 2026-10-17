import { requireModule } from "@/core/permissions/require-module";
import { getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getSalesQuote } from "@/modules/sales-quotes/quote-service";
import { SalesOrderForm } from "@/modules/sales-orders/sales-order-form";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default async function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ customerId?: string; projectId?: string; quoteId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "sales");

  const sourceQuote = query.quoteId ? getSalesQuote(businessId, user.id, query.quoteId) : null;
  const customers = listCustomers(businessId, user.id);
  const accounts = getSalesAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter(
    (tax) => ["sales", "both"].includes(tax.direction) && tax.vatCategory,
  );
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);

  const today = new Date().toISOString().slice(0, 10);
  const defaultTax =
    taxes.find((tax) => tax.rateBasisPoints === 500 && tax.vatCategory === "standard")?.id ?? taxes[0]?.id ?? "";
  const projectId = sourceQuote?.quote.projectId ?? (projects.some((project) => project.id === query.projectId) ? query.projectId! : "");
  const customerId = sourceQuote?.quote.customerId ?? (customers.some((customer) => customer.id === query.customerId) ? query.customerId! : "");
  const documentCurrency =
    sourceQuote?.quote.currencyCode ??
    customers.find((customer) => customer.id === customerId)?.defaultCurrencyCode ??
    access.business.currency;
  const documentMinorUnit =
    currencySettings.currencies.find((c) => c.code === documentCurrency)?.minor_unit ?? 2;

  const lines = sourceQuote?.lines.length
    ? sourceQuote.lines.map((line) => ({
        itemId: line.itemId ?? "",
        description: line.description,
        quantity: quantityMicrosToInput(line.quantityMicros),
        unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit),
        discountType: line.discountType ?? "none",
        discountValue: line.discountValue ?? "0",
        salesAccountId: line.salesAccountId ?? accounts[0]?.id ?? "",
        taxCodeId: line.taxCodeId ?? defaultTax,
        projectId: line.projectId ?? "",
      }))
    : [
        {
          itemId: "",
          description: "",
          quantity: "1",
          unitPrice: "0.00",
          discountType: "none" as const,
          discountValue: "0",
          salesAccountId: accounts[0]?.id ?? "",
          taxCodeId: defaultTax,
          projectId: "",
        },
      ];

  return (
    <div className="page-container">
      <Breadcrumbs
        businessId={businessId}
        items={[
          { label: "Sales Orders", href: `/b/${businessId}/sales/orders` },
          { label: "New Sales Order" },
        ]}
      />
      <div className="mb-7">
        <h1 className="page-title">New Sales Order</h1>
        <p className="page-description">Save a draft or issue a sales order.</p>
      </div>
      <SalesOrderForm
        businessId={businessId}
        customers={customers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
        expenseAccounts={accounts.map(({ id, name }) => ({ id, name }))}
        taxCodes={taxes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
        projects={projects}
        items={items.map(({ id, sku, name, salesPriceMinor, salesAccountId }) => ({
          id,
          sku,
          name,
          salesPriceMinor,
          salesAccountId,
        }))}
        currency={access.business.currency}
        currencies={currencySettings.currencies
          .filter((currency) => currency.is_active)
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
          currencyCode: documentCurrency,
          exchangeRateToBase: sourceQuote?.quote.exchangeRateToBase ?? (documentCurrency === access.business.currency ? "1" : ""),
          exchangeRateDate: sourceQuote?.quote.exchangeRateDate ?? (documentCurrency === access.business.currency ? today : ""),
          exchangeRateSource: (sourceQuote?.quote.exchangeRateSource as any) ?? (documentCurrency === access.business.currency ? "Base" : ""),
          salesQuoteId: sourceQuote?.quote.id ?? "",
          customerId,
          projectId,
          date: today,
          expectedDate: sourceQuote?.quote.expiryDate ?? "",
          reference: sourceQuote?.quote.reference || sourceQuote?.quote.quoteNumber || "",
          notes: sourceQuote?.quote.notes ?? "",
          terms: sourceQuote?.quote.terms ?? "",
          amountsIncludeTax: Boolean(sourceQuote?.quote.amountsIncludeTax),
          lines,
        }}
      />
    </div>
  );
}
