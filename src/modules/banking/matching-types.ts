export type MatchSourceType = "receipt" | "supplier_payment" | "bank_transaction" | "bank_transfer";

export type MatchCandidate = {
  sourceType: MatchSourceType;
  sourceId: string;
  sourceNumber: string;
  date: string;
  amountMinor: number;
  party: string | null;
  description: string | null;
  reference: string | null;
  journalEntryId: string;
  dateDistance: number;
  referenceMatch: boolean;
};

export function getSourceHref(businessId: string, sourceType: string, sourceId: string) {
  if (sourceType === "receipt") return `/b/${businessId}/sales/receipts/${sourceId}`;
  if (sourceType === "supplier_payment") return `/b/${businessId}/purchases/payments/${sourceId}`;
  if (sourceType === "bank_transaction") return `/b/${businessId}/banking/transactions/${sourceId}`;
  if (sourceType === "bank_transfer") return `/b/${businessId}/banking/transfers/${sourceId}`;
  return null;
}
