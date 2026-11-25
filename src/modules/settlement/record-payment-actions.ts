"use server";

import { requirePermission } from "@/core/permissions/require-module";
import { getBusinessTodayIso } from "@/core/format";
import { getBusinessDb } from "@/core/db/business";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";
import { getPurchaseInvoice } from "@/modules/purchase-invoices/purchase-invoice-service";
import { getBankAccountOptions } from "@/modules/accounting/services/account-service";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import type { DocumentCurrencyOption, DocumentRateOption } from "@/modules/currency/document-currency-fields";

export type RecordPaymentKind = "receipt" | "payment";

export type RecordPaymentContext = {
  kind: RecordPaymentKind;
  documentId: string;
  documentNumber: string;
  partyId: string;
  partyName: string;
  currencyCode: string;
  minorUnit: number;
  baseCurrencyCode: string;
  balanceMinor: number;
  today: string;
  defaultBankAccountId: string;
  bankAccounts: { id: string; name: string }[];
  currency: DocumentCurrencyOption;
  /** Stored rates for the document currency. */
  rates: DocumentRateOption[];
};

/** Loads what the Record Payment sheet needs for one open sales or purchase invoice. */
export async function getRecordPaymentContextAction(
  businessId: string,
  kind: RecordPaymentKind,
  documentId: string,
): Promise<{ context?: RecordPaymentContext; error?: string }> {
  const { user } = await requirePermission(businessId, kind === "receipt" ? "sales" : "purchases", "create");
  const document = kind === "receipt"
    ? (() => {
        const record = getInvoice(businessId, user.id, documentId);
        return record && {
          number: record.invoice.invoiceNumber,
          partyId: record.customer.id,
          partyName: record.customer.name,
          currencyCode: record.invoice.currencyCode,
          status: record.invoice.documentStatus,
          balanceMinor: record.balanceMinor,
        };
      })()
    : (() => {
        const record = getPurchaseInvoice(businessId, user.id, documentId);
        return record && {
          number: record.invoice.internalNumber,
          partyId: record.supplier.id,
          partyName: record.supplier.name,
          currencyCode: record.invoice.currencyCode,
          status: record.invoice.documentStatus,
          balanceMinor: record.balanceMinor,
        };
      })();
  if (!document) return { error: "The document could not be found." };
  if (document.status !== "posted" || document.balanceMinor <= 0) {
    return { error: "This document has no open balance to settle." };
  }

  const settings = getCurrencySettings(businessId, user.id);
  const currency = settings.currencies.find((row) => row.code === document.currencyCode);
  const bankAccounts = getBankAccountOptions(businessId, user.id).map(({ id, name }) => ({ id, name }));
  const { sqlite } = getBusinessDb(businessId, user.id);
  const configured = sqlite
    .prepare("SELECT default_bank_account_id FROM business_accounting_settings WHERE id = 'default'")
    .get() as { default_bank_account_id: string | null } | undefined;
  const defaultBankAccountId = bankAccounts.some((row) => row.id === configured?.default_bank_account_id)
    ? configured!.default_bank_account_id!
    : bankAccounts[0]?.id ?? "";

  return {
    context: {
      kind,
      documentId,
      documentNumber: document.number,
      partyId: document.partyId,
      partyName: document.partyName,
      currencyCode: document.currencyCode,
      minorUnit: currency?.minor_unit ?? settings.base.minor_unit,
      baseCurrencyCode: settings.base.code,
      balanceMinor: document.balanceMinor,
      today: getBusinessTodayIso(),
      defaultBankAccountId,
      bankAccounts,
      currency: {
        code: document.currencyCode,
        name: currency?.name ?? document.currencyCode,
        minorUnit: currency?.minor_unit ?? settings.base.minor_unit,
      },
      rates: settings.rates
        .filter((rate) => rate.currency_code === document.currencyCode)
        .map((rate) => ({
          id: rate.id,
          currencyCode: rate.currency_code,
          rateDate: rate.rate_date,
          rateToBase: rate.rate_to_base,
          source: rate.source,
          sourceReference: rate.source_reference,
        })),
    },
  };
}
