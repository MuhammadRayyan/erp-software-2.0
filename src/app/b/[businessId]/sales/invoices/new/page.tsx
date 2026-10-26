import Link from "next/link";
import { ContactRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getSalesQuote, listSalesQuotes } from "@/modules/sales-quotes/quote-service";
import { getSalesOrder, listSalesOrders } from "@/modules/sales-orders/sales-order-service";
import { InvoiceForm } from "@/modules/sales-invoices/invoice-form";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { getAllCustomersUnallocatedCredit } from "@/modules/receipts/receipt-service";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ customerId?: string; projectId?: string; quoteId?: string; orderId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "sales");

  const sourceQuote = query.quoteId ? getSalesQuote(businessId, user.id, query.quoteId) : null;
  const sourceOrder = query.orderId ? getSalesOrder(businessId, user.id, query.orderId) : null;
  const quotes = listSalesQuotes(businessId, user.id, { onlyLatest: true });
  const orders = listSalesOrders(businessId, user.id, { onlyLatest: true });

  const customers = listCustomers(businessId, user.id);
  const salesAccounts = getSalesAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter(
    (code) => code.vatCategory && ["sales", "both"].includes(code.direction),
  );
  const settings = getAccountingSettings(businessId, user.id);
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const customFields = listCustomFieldDefinitions(businessId, user.id, "sales_invoice").map(
    ({ id, name, fieldType, selectOptions, isRequired }) => ({
      id,
      name,
      fieldType,
      selectOptions,
      isRequired,
    }),
  );
  const currencySettings = getCurrencySettings(businessId, user.id);
  const availableCustomerCredits = getAllCustomersUnallocatedCredit(businessId, user.id);

  const selectedProject =
    (sourceOrder?.order.projectId ? projects.find((p) => p.id === sourceOrder.order.projectId) : null) ??
    (sourceQuote?.quote.projectId ? projects.find((p) => p.id === sourceQuote.quote.projectId) : null) ??
    projects.find((project) => project.id === query.projectId);

  const selectedCustomerId =
    sourceOrder?.order.customerId ??
    sourceQuote?.quote.customerId ??
    selectedProject?.customer_id ??
    (customers.some((customer) => customer.id === query.customerId) ? query.customerId! : "");

  const documentCurrency =
    sourceOrder?.order.currencyCode ??
    sourceQuote?.quote.currencyCode ??
    customers.find((customer) => customer.id === selectedCustomerId)?.defaultCurrencyCode ??
    access.business.currency;

  const documentMinorUnit =
    currencySettings.currencies.find((c) => c.code === documentCurrency)?.minor_unit ?? 2;

  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 14);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const defaultTaxCode =
    taxCodes.find((taxCode) => taxCode.vatCategory === "standard" && taxCode.rateBasisPoints === 500) ??
    taxCodes[0];

  const sourceLines = sourceOrder?.lines ?? sourceQuote?.lines ?? [];
  const lines = sourceLines.length
    ? sourceLines.map((line) => ({
        itemId: line.itemId ?? "",
        description: line.description,
        quantity: quantityMicrosToInput(line.quantityMicros),
        unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit),
        discountType: ((line.discountType as any) ?? "none") as "none" | "percentage" | "fixed",
        discountValue: line.discountValue ?? "0",
        salesAccountId: line.salesAccountId ?? settings.defaultSalesAccountId,
        taxCodeId: line.taxCodeId ?? defaultTaxCode.id,
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
          salesAccountId: settings.defaultSalesAccountId,
          taxCodeId: defaultTaxCode.id,
          projectId: "",
        },
      ];

  const ready = customers.length && salesAccounts.length && taxCodes.length;

  return (
    <div className="page-container">
      <Breadcrumbs
        businessId={businessId}
        items={[
          { label: "Sales Invoices", href: `/b/${businessId}/sales/invoices` },
          { label: "New Invoice" },
        ]}
      />
      <div className="mb-7">
        <h1 className="page-title">New Sales Invoice</h1>
        <p className="page-description">
          Save a non-posting draft or post a balanced Accounts Receivable entry.
        </p>
      </div>
      {ready ? (
        <InvoiceForm
          businessId={businessId}
          customers={customers as any}
          salesAccounts={salesAccounts.map(({ id, name }) => ({ id, name }))}
          taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
          projects={projects.map((project) => ({
            id: project.id,
            code: project.code,
            name: project.name,
            customerId: project.customer_id,
          }))}
          items={items.map(({ id, sku, name, salesPriceMinor, salesAccountId }) => ({
            id,
            sku,
            name,
            salesPriceMinor,
            salesAccountId,
          }))}
          orders={orders.map((o) => ({ id: o.id, orderNumber: o.order_number, customerId: o.customer_id, date: o.date }))}
          quotes={quotes.map((q) => ({ id: q.id, quoteNumber: q.quote_number, customerId: q.customer_id, date: q.date }))}
          customFields={customFields}
          currency={access.business.currency}
          currencies={currencySettings.currencies
            .filter((entry) => entry.is_active)
            .map((entry) => ({ code: entry.code, name: entry.name, minorUnit: entry.minor_unit }))}
          rates={currencySettings.rates.map((entry) => ({
            id: entry.id,
            currencyCode: entry.currency_code,
            rateDate: entry.rate_date,
            rateToBase: entry.rate_to_base,
            source: entry.source,
            sourceReference: entry.source_reference,
          }))}
          initial={{
            currencyCode: documentCurrency,
            exchangeRateToBase:
              sourceOrder?.order.exchangeRateToBase ??
              sourceQuote?.quote.exchangeRateToBase ??
              (documentCurrency === access.business.currency ? "1" : ""),
            exchangeRateDate:
              sourceOrder?.order.exchangeRateDate ??
              sourceQuote?.quote.exchangeRateDate ??
              (documentCurrency === access.business.currency ? iso(today) : ""),
            exchangeRateSource:
              ((sourceOrder?.order.exchangeRateSource ?? sourceQuote?.quote.exchangeRateSource) as any) ??
              (documentCurrency === access.business.currency ? "Base" : ""),
            salesOrderId: sourceOrder?.order.id ?? "",
            customerId: selectedCustomerId,
            projectId: selectedProject?.id ?? "",
            invoiceDate: iso(today),
            taxDate: iso(today),
            supplyEmirate: "",
            dueDate: iso(due),
            reference:
              sourceOrder?.order.orderNumber ??
              (sourceQuote?.quote.reference || sourceQuote?.quote.quoteNumber) ??
              "",
            notes: sourceOrder?.order.notes ?? sourceQuote?.quote.notes ?? "",
            terms: sourceOrder?.order.terms ?? sourceQuote?.quote.terms ?? "",
            amountsIncludeTax: Boolean(
              sourceOrder?.order.amountsIncludeTax ?? sourceQuote?.quote.amountsIncludeTax
            ),
            applyAvailableCredit: Boolean(
              selectedCustomerId && (availableCustomerCredits[selectedCustomerId]?.length ?? 0) > 0
            ),
            applyCreditReceiptId: "",
            applyCreditAmount: "",
            lines,
          }}
          availableCustomerCredits={availableCustomerCredits}
        />
      ) : (
        <div className="max-w-xl rounded-lg border border-border bg-surface-raised p-6">
          <ContactRound className="size-6 text-primary" />
          <h2 className="mt-4 text-base font-semibold">Invoice setup needs attention</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Add a customer and ensure at least one active Sales account and tax code exist.
          </p>
          <Button permission="create" asChild className="mt-5">
            <Link href={`/b/${businessId}/customers/new`}>New Customer</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

