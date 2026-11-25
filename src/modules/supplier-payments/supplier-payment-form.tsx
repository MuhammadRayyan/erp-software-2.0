"use client";

import { useMemo } from "react";
import { SettlementAllocationForm } from "@/components/documents/settlement-allocation-form";
import type { SettlementOpenDocument } from "@/components/documents/settlement-allocation-math";
import type { DocumentCurrencyOption, DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { createSupplierPaymentAction } from "./actions";
import type { SupplierPaymentInput } from "./supplier-payment-input";

type Option = { id: string; name: string };

export type InvoiceOption = {
  id: string;
  internalNumber: string;
  supplierId: string;
  invoiceDate: string;
  dueDate: string;
  totalMinor: number;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
};

export function SupplierPaymentForm({
  businessId,
  currency,
  suppliers,
  invoices,
  bankAccounts,
  currencies,
  rates,
  initial,
}: {
  businessId: string;
  currency: string;
  suppliers: Option[];
  invoices: InvoiceOption[];
  bankAccounts: Option[];
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: SupplierPaymentInput;
}) {
  const documents = useMemo<SettlementOpenDocument[]>(
    () =>
      invoices.map((inv) => ({
        id: inv.id,
        documentNumber: inv.internalNumber,
        counterpartyId: inv.supplierId,
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
    const initialInvId = initial.purchaseInvoiceId || initial.invoiceId;
    if (initial.allocations?.length) {
      for (const alloc of initial.allocations) {
        if (alloc.invoiceId && alloc.amount) {
          map[alloc.invoiceId] = alloc.amount;
        }
      }
    } else if (initialInvId && initial.amount) {
      map[initialInvId] = initial.amount;
    }
    return map;
  }, [initial]);

  return (
    <SettlementAllocationForm
      direction="payment"
      businessId={businessId}
      currency={currency}
      counterparties={suppliers}
      documents={documents}
      bankAccounts={bankAccounts}
      currencies={currencies}
      rates={rates}
      cancelHref={`/b/${businessId}/purchases/payments`}
      initial={{
        counterpartyId: initial.supplierId ?? "",
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
        const singleInvoiceId =
          payload.allocations.length === 1 ? payload.allocations[0]?.invoiceId : undefined;
        const result = await createSupplierPaymentAction(businessId, {
          supplierId: payload.counterpartyId,
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
          purchaseInvoiceId: singleInvoiceId,
          invoiceId: singleInvoiceId,
        }, afterSave);
        return result ?? {};
      }}
    />
  );
}
