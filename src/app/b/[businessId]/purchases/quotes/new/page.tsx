import { requireModule } from "@/core/permissions/require-module";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { PurchaseQuoteForm } from "@/modules/purchase-quotes/purchase-quote-form";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { BackLink } from "@/components/back-link";
import { getFormDefaults } from "@/modules/form-defaults/form-defaults-service";
import { listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";

export default async function NewPurchaseQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ supplierId?: string; projectId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");
  const formDefaults = getFormDefaults(businessId, user.id, "purchase-quote");

  const suppliers = listActiveSuppliers(businessId, user.id);
  const accounts = getExpenseAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter(
    (tax) => ["purchases", "both"].includes(tax.direction) && tax.vatCategory,
  );
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const lineCustomFields = listCustomFieldDefinitions(businessId, user.id, "purchase_quote_line").map(
    ({ id, name, fieldType, selectOptions, isRequired }) => ({ id, name, fieldType, selectOptions, isRequired }),
  );

  const today = new Date().toISOString().slice(0, 10);
  const defaultTax =
    (formDefaults.defaultTaxCodeId ? taxes.find((tax) => tax.id === formDefaults.defaultTaxCodeId)?.id : undefined) ??
    taxes.find((tax) => tax.rateBasisPoints === 500 && tax.vatCategory === "standard")?.id ??
    taxes[0]?.id ??
    "";
  const defaultExpenseAccount =
    (formDefaults.defaultExpenseAccountId ? accounts.find((a) => a.id === formDefaults.defaultExpenseAccountId)?.id : undefined) ??
    accounts[0]?.id ??
    "";
  const projectId = projects.some((project) => project.id === query.projectId) ? query.projectId! : "";
  const supplierId = suppliers.some((supplier) => supplier.id === query.supplierId) ? query.supplierId! : "";
  const documentCurrency =
    suppliers.find((supplier) => supplier.id === supplierId)?.defaultCurrencyCode ?? access.business.currency;

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/purchases/quotes`}>Purchase Quotes</BackLink>
      <div className="mb-7">
        <h1 className="page-title">New Purchase Quote</h1>
        <p className="page-description">Save a draft or issue an operational supplier quote without ledger impact.</p>
      </div>
      <PurchaseQuoteForm
        businessId={businessId}
        suppliers={suppliers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))}
        expenseAccounts={accounts.map(({ id, name }) => ({ id, name }))}
        taxCodes={taxes.map(({ id, name, rateBasisPoints, vatCategory }) => ({ id, name, rateBasisPoints, vatCategory }))}
        projects={projects}
        items={items.map(({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }) => ({
          id,
          sku,
          name,
          purchasePriceMinor,
          inventoryAssetAccountId,
        }))}
        currency={access.business.currency}
        lineCustomFields={lineCustomFields}
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
          supplierId,
          projectId,
          date: today,
          expiryDate: "",
          reference: "",
          notes: formDefaults.defaultNotes ?? "",
          terms: formDefaults.defaultTerms ?? "",
          amountsIncludeTax: Boolean(formDefaults.amountsIncludeTax),
          lines: [
            {
              itemId: "",
              description: "",
              quantity: "1",
              unitPrice: "0.00",
              discountType: "none",
              discountValue: "0",
              expenseAccountId: defaultExpenseAccount,
              taxCodeId: defaultTax,
              projectId: "",
            },
          ],
        }}
      />
    </div>
  );
}
