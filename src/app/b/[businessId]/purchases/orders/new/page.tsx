import { requireModule } from "@/core/permissions/require-module";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { PurchaseOrderForm } from "@/modules/purchase-orders/purchase-order-form";
import { getPurchaseQuote, listPurchaseQuotes } from "@/modules/purchase-quotes/purchase-quote-service";
import { getSalesOrder } from "@/modules/sales-orders/sales-order-service";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { BackLink } from "@/components/back-link";

export default async function NewPurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ supplierId?: string; projectId?: string; quoteId?: string; salesOrderId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");

  const sourceQuote = query.quoteId ? getPurchaseQuote(businessId, user.id, query.quoteId) : null;
  const sourceSalesOrder = query.salesOrderId ? getSalesOrder(businessId, user.id, query.salesOrderId) : null;
  const quotes = listPurchaseQuotes(businessId, user.id, { onlyLatest: true });

  const suppliers = listActiveSuppliers(businessId, user.id);
  const accounts = getExpenseAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter(
    (tax) => ["purchases", "both"].includes(tax.direction) && tax.vatCategory,
  );
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);

  const today = new Date().toISOString().slice(0, 10);
  const defaultTax =
    taxes.find((tax) => tax.rateBasisPoints === 500 && tax.vatCategory === "standard")?.id ?? taxes[0]?.id ?? "";

  const projectId =
    sourceQuote?.quote.projectId ??
    sourceSalesOrder?.order.projectId ??
    (projects.some((project) => project.id === query.projectId) ? query.projectId! : "");

  const supplierId =
    sourceQuote?.quote.supplierId ??
    (suppliers.some((supplier) => supplier.id === query.supplierId) ? query.supplierId! : "");

  const documentCurrency =
    sourceQuote?.quote.currencyCode ??
    suppliers.find((supplier) => supplier.id === supplierId)?.defaultCurrencyCode ??
    access.business.currency;

  const documentMinorUnit =
    currencySettings.currencies.find((c) => c.code === documentCurrency)?.minor_unit ?? 2;

  const lines = sourceQuote?.lines.length
    ? sourceQuote.lines.map((line) => ({
        itemId: line.itemId ?? "",
        description: line.description,
        quantity: quantityMicrosToInput(line.quantityMicros),
        unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit),
        expenseAccountId: line.expenseAccountId ?? accounts[0]?.id ?? "",
        taxCodeId: line.taxCodeId ?? defaultTax,
        projectId: line.projectId ?? "",
      }))
    : sourceSalesOrder?.lines.length
    ? sourceSalesOrder.lines.map((line) => {
        const matchingItem = items.find((i) => i.id === line.itemId);
        return {
          itemId: line.itemId ?? "",
          description: line.description,
          quantity: quantityMicrosToInput(line.quantityMicros),
          unitPrice: matchingItem ? minorToCurrencyInput(matchingItem.purchasePriceMinor ?? 0, documentMinorUnit) : "0.00",
          expenseAccountId: matchingItem?.inventoryAssetAccountId ?? accounts[0]?.id ?? "",
          taxCodeId: defaultTax,
          projectId: line.projectId ?? "",
        };
      })
    : [
        {
          itemId: "",
          description: "",
          quantity: "1",
          unitPrice: "0.00",
          expenseAccountId: accounts[0]?.id ?? "",
          taxCodeId: defaultTax,
          projectId: "",
        },
      ];

  const reference =
    sourceQuote?.quote.reference ||
    sourceQuote?.quote.quoteNumber ||
    (sourceSalesOrder?.order.orderNumber ? `SO-${sourceSalesOrder.order.orderNumber}` : "");

  const notes =
    sourceQuote?.quote.notes ||
    (sourceSalesOrder?.order.orderNumber ? `Back-to-back purchase for Sales Order ${sourceSalesOrder.order.orderNumber}` : "");

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/purchases/orders`}>Purchase Orders</BackLink>
      <div className="mb-7">
        <h1 className="page-title">New Purchase Order</h1>
        <p className="page-description">Save a draft or issue an operational order without ledger impact.</p>
      </div>
      <PurchaseOrderForm
        businessId={businessId}
        suppliers={suppliers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
        expenseAccounts={accounts.map(({ id, name }) => ({ id, name }))}
        taxCodes={taxes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
        projects={projects}
        items={items.map(({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }) => ({
          id,
          sku,
          name,
          purchasePriceMinor,
          inventoryAssetAccountId,
        }))}
        quotes={quotes.map((q) => ({ id: q.id, quoteNumber: q.quote_number, supplierId: q.supplier_id, date: q.date }))}
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
          exchangeRateToBase:
            sourceQuote?.quote.exchangeRateToBase ??
            (documentCurrency === access.business.currency ? "1" : ""),
          exchangeRateDate:
            sourceQuote?.quote.exchangeRateDate ??
            (documentCurrency === access.business.currency ? today : ""),
          exchangeRateSource:
            ((sourceQuote?.quote.exchangeRateSource) as any) ??
            (documentCurrency === access.business.currency ? "Base" : ""),
          purchaseQuoteId: sourceQuote?.quote.id ?? "",
          supplierId,
          projectId,
          date: today,
          expectedDate: sourceQuote?.quote.expiryDate ?? "",
          reference,
          notes,
          terms: sourceQuote?.quote.terms ?? "",
          lines,
        }}
      />
    </div>
  );
}
