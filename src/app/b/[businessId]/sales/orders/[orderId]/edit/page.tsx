import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { SalesOrderForm } from "@/modules/sales-orders/sales-order-form";
import { getSalesOrder } from "@/modules/sales-orders/sales-order-service";
import { listSalesQuotes } from "@/modules/sales-quotes/quote-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default async function EditOrderPage({ params }: { params: Promise<{ businessId: string; orderId: string }> }) {
  const { businessId, orderId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const record = getSalesOrder(businessId, user.id, orderId);
  if (!record) notFound();
  if (["completed", "cancelled", "superseded"].includes(record.order.documentStatus)) {
    return (
      <div className="page-container">
        <h1 className="page-title">{record.order.documentStatus === "completed" ? "Completed order" : record.order.documentStatus === "superseded" ? "Superseded order" : "Cancelled order"}</h1>
        <p className="page-description">
          {record.order.documentStatus === "completed"
            ? "Completed orders are fulfilled and cannot be edited directly. Create a new revision if changes are required."
            : record.order.documentStatus === "superseded"
            ? "This order has been superseded by a newer revision and cannot be edited."
            : "Cancelled orders are retained for history and cannot be edited."}
        </p>
        <Button asChild className="mt-5"><Link href={`/b/${businessId}/sales/orders/${orderId}`}>Return to order</Link></Button>
      </div>
    );
  }
  const customers = listCustomers(businessId, user.id);
  const salesAccounts = getSalesAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["sales", "both"].includes(code.direction));
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const quotes = listSalesQuotes(businessId, user.id, { onlyLatest: true });
  const currencySettings = getCurrencySettings(businessId, user.id);
  const documentMinorUnit = currencySettings.currencies.find((entry) => entry.code === record.order.currencyCode)?.minor_unit ?? 2;

  return <div className="page-container">
    <Breadcrumbs
      businessId={businessId}
      items={[
        { label: "Sales Orders", href: `/b/${businessId}/sales/orders` },
        { label: record.order.orderNumber, href: `/b/${businessId}/sales/orders/${orderId}` },
        { label: "Edit" },
      ]}
    />
    <div className="mb-7"><h1 className="page-title">Edit Sales Order</h1><p className="page-description">Update the draft or active order details.</p></div>
    <SalesOrderForm
      businessId={businessId}
      orderId={orderId}
      status={record.order.documentStatus}
      customers={customers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
      expenseAccounts={salesAccounts.map(({ id, name }) => ({ id, name }))}
      taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
      projects={projects.map((project) => ({ id: project.id, code: project.code, name: project.name, customerId: project.customer_id }))}
      items={items.map(({ id, sku, name, salesPriceMinor, salesAccountId }) => ({ id, sku, name, salesPriceMinor, salesAccountId }))}
      quotes={quotes.map((q) => ({ id: q.id, quoteNumber: q.quote_number, customerId: q.customer_id, date: q.date }))}
      currency={access.business.currency}
      currencies={currencySettings.currencies.filter((entry) => entry.is_active || entry.code === record.order.currencyCode).map((entry) => ({ code: entry.code, name: entry.name, minorUnit: entry.minor_unit }))}
      rates={currencySettings.rates.map((entry) => ({ id: entry.id, currencyCode: entry.currency_code, rateDate: entry.rate_date, rateToBase: entry.rate_to_base, source: entry.source, sourceReference: entry.source_reference }))}
      initial={{
        currencyCode: record.order.currencyCode,
        exchangeRateToBase: record.order.exchangeRateToBase,
        exchangeRateDate: record.order.exchangeRateDate,
        exchangeRateSource: record.order.exchangeRateSource as "Base" | "Manual" | "CBUAE",
        customerId: record.order.customerId,
        projectId: record.order.projectId ?? "",
        salesQuoteId: record.order.salesQuoteId ?? "",
        date: record.order.orderDate,
        expectedDate: record.order.deliveryDate ?? "",
        reference: record.order.reference ?? "",
        notes: record.order.notes ?? "",
        terms: record.order.terms ?? "",
        amountsIncludeTax: record.order.amountsIncludeTax,
        lines: record.lines.map((line: any) => ({
          itemId: line.itemId ?? "",
          description: line.description,
          quantity: quantityMicrosToInput(line.quantityMicros),
          unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit),
          discountType: line.discountType ?? "none",
          discountValue: line.discountValue ?? "0",
          salesAccountId: line.salesAccountId,
          taxCodeId: line.taxCodeId,
          projectId: line.projectId ?? "",
        })),
      }}
    />
  </div>;
}
