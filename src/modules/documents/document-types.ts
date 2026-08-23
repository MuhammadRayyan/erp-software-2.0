export interface BaseStoredLine {
  id: string;
  lineIndex: number;
  description: string;
  quantityMicros: number;
  unitPriceMinor: number;
  netAmountMinor: number;
  taxCodeId: string;
  taxAmountMinor: number;
  grossAmountMinor: number;
  projectId: string | null;
  salesAccountId?: string;
  expenseAccountId?: string;
  itemId?: string | null;
  salesInvoiceLineId?: string | null;
  purchaseOrderLineId?: string | null;
  unitCostMinor?: number;
}
