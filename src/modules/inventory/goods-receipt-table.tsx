"use client";

import type { ColumnVisibility } from "@/components/use-column-visibility";
import { StockDocumentTable, type StockDocumentTableConfig } from "./stock-document-table";

export type GoodsReceiptRow = {
  id: string;
  receipt_number: string;
  supplier_name: string;
  date: string;
  location_code: string;
  quantity_micros: number;
  value_minor: number;
  document_status: string;
};

const goodsReceiptTable: StockDocumentTableConfig<GoodsReceiptRow> = {
  path: "purchases/goods-receipts",
  storageKey: "goods-receipts",
  pdfType: "goods-receipt",
  number: (row) => row.receipt_number,
  numberKey: "receipt_number",
  numberHeader: "Receipt",
  csvNumberHeader: "Receipt Number",
  partyName: (row) => row.supplier_name,
  partyKey: "supplier_name",
  partyLabel: "Supplier",
  partyParam: "supplierId",
  valueLabel: "Value",
  totalLabel: "Total Received Value",
  plural: "goods receipts",
  dateLabel: "Receipt",
  editLabel: "Edit Receipt",
};

export function GoodsReceiptTable(props: {
  businessId: string;
  currency: string;
  rows: GoodsReceiptRow[];
  serverSnapshot?: ColumnVisibility;
}) {
  return <StockDocumentTable config={goodsReceiptTable} {...props} />;
}
