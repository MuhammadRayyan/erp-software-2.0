"use client";

import { useMemo } from "react";
import { SettlementAllocationForm } from "@/components/documents/settlement-allocation-form";
import type { SettlementOpenDocument } from "@/components/documents/settlement-allocation-math";
import type { DocumentCurrencyOption, DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { createReceiptAction } from "./actions";
import type { ReceiptInput } from "./receipt-input";

type Option = { id: string; name: string };

export type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  totalMinor: number;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
};

export function ReceiptForm({
  businessId,
  currency,
  customers,
  invoices,
  bankAccounts,
  currencies,
  rates,
  initial,
}: {
  businessId: string;
  currency: string;
  customers: Option[];
  invoices: InvoiceOption[];
  bankAccounts: Option[];
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: ReceiptInput;
}) {
  const documents = useMemo<SettlementOpenDocument[]>(
    () =>
      invoices.map((inv) => ({
        id: inv.id,
        documentNumber: inv.invoiceNumber,
        counterpartyId: inv.customerId,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalMinor: inv.totalMinor,
        balanceMinor: inv.balanceMinor,
        currencyCode: inv.currencyCode,
        minorUnit: inv.minorUnit,
      })),
    [invoices],
  );

  const initialAllocations = useMemo(() => {
    const map: Record<string, string> = {};
    if (initial.allocations?.length) {
      for (const alloc of initial.allocations) {
        if (alloc.invoiceId && alloc.amount) {
          map[alloc.invoiceId] = alloc.amount;
        }
      }
    } else if (initial.invoiceId && initial.amount) {
      map[initial.invoiceId] = initial.amount;
    }
    return map;
  }, [initial]);

  return (
    <SettlementAllocationForm
      direction="receipt"
      businessId={businessId}
      currency={currency}
      counterparties={customers}
      documents={documents}
      bankAccounts={bankAccounts}
      currencies={currencies}
      rates={rates}
      cancelHref={`/b/${businessId}/sales/receipts`}
      initial={{
        counterpartyId: initial.customerId ?? "",
        bankAccountId: initial.bankAccountId ?? "",
        date: initial.date ?? "",
        amount: initial.amount ?? "",
        reference: initial.reference ?? "",
        description: initial.description ?? "",
        currencyCode: initial.currencyCode ?? currency,
        exchangeRateToBase: initial.exchangeRateToBase ?? "1",
        exchangeRateDate: initial.exchangeRateDate ?? "",
        exchangeRateSource: initial.exchangeRateSource ?? "",
        allocations: initialAllocations,
      }}
      onSubmitAction={async (payload, afterSave = "view") => {
        const result = await createReceiptAction(businessId, {
          customerId: payload.counterpartyId,
          bankAccountId: payload.bankAccountId,
          date: payload.date,
          amount: payload.amount,
          reference: payload.reference,
          description: payload.description,
          currencyCode: payload.currencyCode,
          exchangeRateToBase: payload.exchangeRateToBase,
          exchangeRateDate: payload.exchangeRateDate,
          exchangeRateSource: payload.exchangeRateSource,
          allocations: payload.allocations,
          invoiceId: payload.allocations.length === 1 ? payload.allocations[0]?.invoiceId : undefined,
        }, afterSave);
        return result ?? {};
      }}
    />
  );
}
