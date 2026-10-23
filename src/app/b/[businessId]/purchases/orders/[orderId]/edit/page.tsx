import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { PurchaseOrderForm } from "@/modules/purchase-orders/purchase-order-form";
import { getPurchaseOrder } from "@/modules/purchase-orders/purchase-order-service";
import { listPurchaseQuotes } from "@/modules/purchase-quotes/purchase-quote-service";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ businessId: string; orderId: string }> }) {
  const { businessId, orderId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const record = getPurchaseOrder(businessId, user.id, orderId);
  if (!record) notFound();
  if (["closed", "cancelled", "superseded"].includes(record.order.status)) {
    return (
      <div className="page-container">
        <h1 className="page-title">{record.order.status === "closed" ? "Closed order" : record.order.status === "superseded" ? "Superseded order" : "Cancelled order"}</h1>
        <p className="page-description">
          {record.order.status === "closed"
            ? "Closed purchase orders are completed and cannot be edited directly."
            : record.order.status === "superseded"
            ? "This order has been superseded by a newer revision and cannot be edited."
            : "Cancelled orders are retained for history and cannot be edited."}
        </p>
        <Button asChild className="mt-5"><Link href={`/b/${businessId}/purchases/orders/${orderId}`}>Return to order</Link></Button>
      </div>
    );
  }
  const suppliers = listActiveSuppliers(businessId, user.id);
  const accounts = getExpenseAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter((tax) => ["purchases", "both"].includes(tax.direction) && tax.vatCategory);
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const quotes = listPurchaseQuotes(businessId, user.id, { onlyLatest: true });
  const currencySettings = getCurrencySettings(businessId, user.id);
  const minorUnit = currencySettings.currencies.find((currency) => currency.code === record.order.currencyCode)?.minor_unit ?? 2;
  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/purchases/orders/${orderId}`}>{record.order.orderNumber}</BackLink>
      <div className="mb-7">
        <h1 className="page-title">Edit Purchase Order</h1>
        <p className="page-description">Updates remain operational and do not create journal entries.</p>
      </div>
      <PurchaseOrderForm
        businessId={businessId}
        orderId={orderId}
        status={record.order.status}
        suppliers={suppliers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
        expenseAccounts={accounts.map(({ id, name }) => ({ id, name }))}
        taxCodes={taxes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
        projects={projects}
        items={items.map(({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }) => ({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }))}
        quotes={quotes.map((q) => ({ id: q.id, quoteNumber: q.quote_number, supplierId: q.supplier_id, date: q.date }))}
        currency={access.business.currency}
        currencies={currencySettings.currencies.filter((currency) => currency.is_active || currency.code === record.order.currencyCode).map((currency) => ({ code: currency.code, name: currency.name, minorUnit: currency.minor_unit }))}
        rates={currencySettings.rates.map((rate) => ({ id: rate.id, currencyCode: rate.currency_code, rateDate: rate.rate_date, rateToBase: rate.rate_to_base, source: rate.source, sourceReference: rate.source_reference }))}
        initial={{
          currencyCode: record.order.currencyCode,
          exchangeRateToBase: record.order.exchangeRateToBase,
          exchangeRateDate: record.order.exchangeRateDate,
          exchangeRateSource: record.order.exchangeRateSource as "Base" | "Manual" | "CBUAE",
          supplierId: record.order.supplierId,
          projectId: record.order.projectId ?? "",
          purchaseQuoteId: record.order.purchaseQuoteId ?? "",
          date: record.order.date,
          expectedDate: record.order.expectedDate ?? "",
          reference: record.order.reference ?? "",
          notes: record.order.notes ?? "",
          terms: record.order.terms ?? "",
          amountsIncludeTax: record.order.amountsIncludeTax,
          lines: record.lines.map((line: any) => ({
            itemId: line.itemId ?? "",
            description: line.description,
            quantity: quantityMicrosToInput(line.quantityMicros),
            unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit),
            discountType: line.discountType ?? "none",
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
