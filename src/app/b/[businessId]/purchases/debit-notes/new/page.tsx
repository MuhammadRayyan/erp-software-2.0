// @ts-nocheck
import Link from "next/link";
import { ArrowLeft, ContactRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getPurchaseAccountOptions } from "@/modules/accounting/services/account-service";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { DebitNoteForm } from "@/modules/purchase-debit-notes/debitNote-form";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function NewDebitNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ customerId?: string; projectId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");
  const customers = listCustomers(businessId, user.id);
  const purchasesAccounts = getPurchaseAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter(
    (code) => code.vatCategory && ["purchases", "both"].includes(code.direction),
  );
  const settings = getAccountingSettings(businessId, user.id);
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const customFields = listCustomFieldDefinitions(businessId, user.id, "purchases_debitNote").map(
    ({ id, name, fieldType, selectOptions, isRequired }) => ({
      id,
      name,
      fieldType,
      selectOptions,
      isRequired,
    }),
  );
  const currencySettings = getCurrencySettings(businessId, user.id);
  const selectedProject = projects.find((project) => project.id === query.projectId);
  const selectedCustomerId =
    selectedProject?.customer_id ??
    (customers.some((customer) => customer.id === query.customerId) ? query.customerId! : "");
  const documentCurrency =
    customers.find((customer) => customer.id === selectedCustomerId)?.defaultCurrencyCode ??
    access.business.currency;
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 14);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const defaultTaxCode =
    taxCodes.find((taxCode) => taxCode.vatCategory === "standard" && taxCode.rateBasisPoints === 500) ??
    taxCodes[0];

  const ready = customers.length && purchasesAccounts.length && taxCodes.length;

  return (
    <div className="page-container">
      <Link
        href={`/b/${businessId}/purchases/debit-notes`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Debit Notes
      </Link>
      <div className="mb-7">
        <h1 className="page-title">New Debit Note</h1>
        <p className="page-description">
          Save a non-posting draft or post a balanced Accounts Receivable entry.
        </p>
      </div>
      {ready ? (
        <DebitNoteForm
          businessId={businessId}
          customers={customers.map(({ id, name, defaultCurrencyCode }) => ({
            id,
            name,
            defaultCurrencyCode,
          }))}
          purchasesAccounts={purchasesAccounts.map(({ id, code, name }) => ({ id, code, name }))}
          taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
          projects={projects.map((project) => ({
            id: project.id,
            code: project.code,
            name: project.name,
            customerId: project.customer_id,
          }))}
          items={items.map(({ id, sku, name, purchasesPriceMinor, purchasesAccountId }) => ({
            id,
            sku,
            name,
            purchasesPriceMinor,
            purchasesAccountId,
          }))}
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
            exchangeRateToBase: documentCurrency === access.business.currency ? "1" : "",
            exchangeRateDate: documentCurrency === access.business.currency ? iso(today) : "",
            exchangeRateSource: documentCurrency === access.business.currency ? "Base" : "",
            customerId: selectedCustomerId,
            projectId: selectedProject?.id ?? "",
            debitNoteDate: iso(today),
            taxDate: iso(today),
            supplyEmirate: "",
            dueDate: iso(due),
            reference: "",
            lines: [
              {
                itemId: "",
                description: "",
                quantity: "1",
                unitPrice: "0.00",
                purchasesAccountId: settings.defaultPurchaseAccountId,
                taxCodeId: defaultTaxCode.id,
                projectId: "",
              },
            ],
          }}
        />
      ) : (
        <div className="max-w-xl rounded-lg border border-border bg-surface-raised p-6">
          <ContactRound className="size-6 text-primary" />
          <h2 className="mt-4 text-base font-semibold">DebitNote setup needs attention</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Add a customer and ensure at least one active Purchase account and tax code exist.
          </p>
          <Button asChild className="mt-5">
            <Link href={`/b/${businessId}/customers/new`}>New Customer</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
