import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { SalesOrderForm } from "@/modules/sales-orders/sales-order-form";

export default async function NewOrderPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ customerId?: string; projectId?: string }> }) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "sales");

  const customers = listCustomers(businessId, user.id);
  const accounts = getSalesAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter(
    (tax) => ["sales", "both"].includes(tax.direction) && tax.vatCategory,
  );
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const customFields = listCustomFieldDefinitions(businessId, user.id, "sales_order").map(({ id, name, fieldType, selectOptions, isRequired }) => ({ id, name, fieldType, selectOptions, isRequired }));

  const today = new Date().toISOString().slice(0, 10);
  const defaultTax =
    taxes.find((tax) => tax.rateBasisPoints === 500 && tax.vatCategory === "standard")?.id ?? taxes[0]?.id ?? "";
  const projectId = projects.some((project) => project.id === query.projectId) ? query.projectId! : "";
  const customerId = customers.some((customer) => customer.id === query.customerId) ? query.customerId! : "";
  const documentCurrency =
    customers.find((customer) => customer.id === customerId)?.defaultCurrencyCode ?? access.business.currency;

  return (
    <div className="page-container">
      <Link href={`/b/${businessId}/sales/orders`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Sales Orders
      </Link>
      <div className="mb-7">
        <h1 className="page-title">New Sales Order</h1>
        <p className="page-description">Save a draft or issue a sales order.</p>
      </div>
      <SalesOrderForm
        businessId={businessId}
        customers={customers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
        expenseAccounts={accounts.map(({ id, code, name }) => ({ id, code, name }))}
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
          exchangeRateToBase: documentCurrency === access.business.currency ? "1" : "",
          exchangeRateDate: documentCurrency === access.business.currency ? today : "",
          exchangeRateSource: documentCurrency === access.business.currency ? "Base" : "",
          customerId,
          projectId,
          date: today,
          expectedDate: "",
          reference: "",
          notes: "",
          terms: "",
          amountsIncludeTax: false,
          lines: [
            {
              itemId: "",
              description: "",
              quantity: "1",
              unitPrice: "0.00",
              discountType: "none",
              discountValue: "0",
              salesAccountId: "",
              taxCodeId: defaultTax,
              projectId: "",
            },
          ],
        }}
      />
    </div>
  );
}
