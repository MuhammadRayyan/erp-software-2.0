import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { listCustomers } from "@/modules/customers/customer-service";
import { getBankAccountOptions } from "@/modules/accounting/services/account-service";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";
import { ReceiptForm } from "@/modules/receipts/receipt-form";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { minorToCurrencyInput } from "@/modules/currency/conversion";

export default async function NewReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ invoiceId?: string; customerId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "sales");
  const customers = listCustomers(businessId, user.id);
  const outstanding = listInvoices(businessId, user.id).filter(
    (invoice) => invoice.documentStatus === "posted" && invoice.balanceMinor > 0,
  );
  const selected = outstanding.find((invoice) => invoice.id === query.invoiceId);
  const bankAccounts = getBankAccountOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const currencyMinorUnits = new Map(currencySettings.currencies.map((currency) => [currency.code, currency.minor_unit]));
  const customerId = selected?.customerId ?? query.customerId ?? "";
  const invoiceId = selected?.id ?? "";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page-container max-w-[900px]">
      <Link href={invoiceId ? `/b/${businessId}/sales/invoices/${invoiceId}` : `/b/${businessId}/sales/invoices`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {selected?.invoiceNumber ?? "Sales Invoices"}
      </Link>
      <div className="mb-7">
        <h1 className="page-title">Record Receipt</h1>
        <p className="page-description">Allocate a customer payment to one posted invoice.</p>
      </div>
      <ReceiptForm
        businessId={businessId}
        currency={access.business.currency}
        currencies={currencySettings.currencies.filter((currency) => currency.is_active).map((currency) => ({ code: currency.code, name: currency.name, minorUnit: currency.minor_unit }))}
        rates={currencySettings.rates.map((rate) => ({ id: rate.id, currencyCode: rate.currency_code, rateDate: rate.rate_date, rateToBase: rate.rate_to_base, source: rate.source, sourceReference: rate.source_reference }))}
        customers={customers.map(({ id, name }) => ({ id, name }))}
        invoices={outstanding.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          balanceMinor: invoice.balanceMinor,
          currencyCode: invoice.currencyCode,
          minorUnit: currencyMinorUnits.get(invoice.currencyCode) ?? 2,
        }))}
        bankAccounts={bankAccounts.map(({ id, code, name }) => ({ id, name: `${code} ${name}` }))}
        initial={{
          customerId,
          invoiceId,
          date: today,
          bankAccountId: bankAccounts[0]?.id ?? "",
          amount: selected ? minorToCurrencyInput(selected.balanceMinor, currencyMinorUnits.get(selected.currencyCode) ?? 2) : "",
          currencyCode: selected?.currencyCode ?? access.business.currency,
          exchangeRateToBase: selected?.currencyCode && selected.currencyCode !== access.business.currency ? "" : "1",
          exchangeRateDate: selected?.currencyCode && selected.currencyCode !== access.business.currency ? "" : today,
          exchangeRateSource: selected?.currencyCode && selected.currencyCode !== access.business.currency ? "" : "Base",
          reference: "",
          description: "",
        }}
      />
    </div>
  );
}
