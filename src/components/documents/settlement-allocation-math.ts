import { minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";

export type SettlementOpenDocument = {
  id: string;
  documentNumber: string;
  counterpartyId: string;
  invoiceDate: string;
  dueDate: string;
  totalMinor: number;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
};

/**
 * Sorts open settlement documents chronologically in FIFO order (`dueDate ASC`, then `invoiceDate ASC`, then `documentNumber ASC`)
 * and allocates up to `totalAmountMinor` across open balances in the active currency.
 */
export function allocateFifo(
  documents: SettlementOpenDocument[],
  totalAmountMinor: number,
  currencyCode?: string,
): Record<string, string> {
  if (totalAmountMinor <= 0) return {};

  const eligible = documents
    .filter((doc) => doc.balanceMinor > 0 && (!currencyCode || doc.currencyCode === currencyCode))
    .sort((a, b) => {
      const aDue = a.dueDate || a.invoiceDate || "";
      const bDue = b.dueDate || b.invoiceDate || "";
      const byDue = aDue.localeCompare(bDue);
      if (byDue !== 0) return byDue;
      const byDate = (a.invoiceDate || "").localeCompare(b.invoiceDate || "");
      if (byDate !== 0) return byDate;
      return a.documentNumber.localeCompare(b.documentNumber);
    });

  let remainingMinor = totalAmountMinor;
  const nextAllocations: Record<string, string> = {};

  for (const doc of eligible) {
    if (remainingMinor <= 0) break;
    const allocMinor = Math.min(doc.balanceMinor, remainingMinor);
    if (allocMinor > 0) {
      nextAllocations[doc.id] = minorToCurrencyInput(allocMinor, doc.minorUnit);
      remainingMinor -= allocMinor;
    }
  }

  return nextAllocations;
}

export function safeParseMinorAmount(rawAmount: string | undefined, minorUnit: number, label = "Amount"): number {
  if (!rawAmount || !rawAmount.trim()) return 0;
  try {
    const minor = parseCurrencyAmountToMinor(rawAmount, minorUnit, label);
    return minor > 0 ? minor : 0;
  } catch {
    return 0;
  }
}

export function computeAllocationTotals(
  amountStr: string | undefined,
  allocations: Record<string, string> | undefined,
  documents: SettlementOpenDocument[],
  minorUnit: number,
) {
  const totalAmountMinor = safeParseMinorAmount(amountStr, minorUnit, "Amount");
  let totalAllocatedMinor = 0;

  if (allocations) {
    for (const [docId, rawAlloc] of Object.entries(allocations)) {
      if (!rawAlloc || !rawAlloc.trim()) continue;
      const doc = documents.find((item) => item.id === docId);
      if (!doc) continue;
      totalAllocatedMinor += safeParseMinorAmount(rawAlloc, doc.minorUnit, "Allocation");
    }
  }

  const unallocatedMinor = Math.max(0, totalAmountMinor - totalAllocatedMinor);
  const isOverAllocated = totalAllocatedMinor > totalAmountMinor && totalAmountMinor > 0;

  return {
    totalAmountMinor,
    totalAllocatedMinor,
    unallocatedMinor,
    isOverAllocated,
  };
}
