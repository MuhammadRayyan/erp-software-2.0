"use client";

import type { ColumnVisibility } from "@/components/use-column-visibility";
import { StockDocumentTable, type StockDocumentTableConfig } from "./stock-document-table";

export type DeliveryNoteRow = {
  id: string;
  delivery_number: string;
  customer_name: string;
  date: string;
  location_code: string;
  quantity_micros: number;
  value_minor: number;
  document_status: string;
};

const deliveryNoteTable: StockDocumentTableConfig<DeliveryNoteRow> = {
  path: "sales/delivery-notes",
  storageKey: "delivery-notes",
  pdfType: "delivery-note",
  number: (row) => row.delivery_number,
  numberKey: "delivery_number",
  numberHeader: "Delivery",
  csvNumberHeader: "Delivery Number",
  partyName: (row) => row.customer_name,
  partyKey: "customer_name",
  partyLabel: "Customer",
  partyParam: "customerId",
  valueLabel: "COGS",
  totalLabel: "Total COGS",
  plural: "delivery notes",
  dateLabel: "Delivery",
  editLabel: "Edit Note",
};

export function DeliveryNoteTable(props: {
  businessId: string;
  currency: string;
  rows: DeliveryNoteRow[];
  serverSnapshot?: ColumnVisibility;
}) {
  return <StockDocumentTable config={deliveryNoteTable} {...props} />;
}
