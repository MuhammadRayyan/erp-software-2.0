"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatDate, formatMoney } from "@/core/format";
import { CashDocumentTable } from "@/modules/shared/cash-document-table";
import type { CashDocumentListSummary } from "@/modules/shared/list-query-helpers";
import type { ReceiptListRow } from "./receipt-service";
import { ReceiptRowActions } from "./receipt-row-actions";

const INITIAL_COLUMNS = {
  bank_account_name: true,
  reference: true,
  base_amount_minor: true,
  document_status: true,
};

const COLUMN_LABELS = {
  bank_account_name: "Bank / Cash",
  reference: "Reference",
  base_amount_minor: "Base Bank",
  document_status: "Status",
};

export function ReceiptTable({
  businessId,
  baseCurrency,
  receipts,
  summary,
  serverSnapshot,
  footer,
}: {
  businessId: string;
  baseCurrency: string;
  receipts: ReceiptListRow[];
  summary: CashDocumentListSummary;
  serverSnapshot?: ColumnVisibility;
  footer?: ReactNode;
}) {
  const columns = useMemo(
    () => [
      {
        accessorKey: "receipt_number",
        header: "Receipt",
        cell: ({ row }: { row: { original: ReceiptListRow } }) => (
          <Link
            href={`/b/${businessId}/sales/receipts/${row.original.id}`}
            className="tabular font-medium text-primary hover:underline"
          >
            {row.original.receipt_number}
          </Link>
        ),
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: ReceiptListRow } }) => formatDate(row.original.date),
      },
      {
        accessorKey: "bank_account_name",
        header: "Bank / Cash",
      },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }: { row: { original: ReceiptListRow } }) => (
          <span className="text-muted-foreground">{row.original.reference || "—"}</span>
        ),
      },
      {
        accessorKey: "amount_minor",
        header: "Amount",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: ReceiptListRow } }) => (
          <span className="money">
            {formatMoney(
              row.original.amount_minor,
              row.original.currency_code,
              row.original.currency_minor_unit,
            )}
          </span>
        ),
      },
      {
        accessorKey: "base_amount_minor",
        header: "Base Bank",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: ReceiptListRow } }) => (
          <span className="money">{formatMoney(row.original.base_amount_minor, baseCurrency)}</span>
        ),
      },
      {
        accessorKey: "document_status",
        header: "Status",
        cell: ({ row }: { row: { original: ReceiptListRow } }) => (
          <StatusBadge status={row.original.document_status} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-14 text-right" },
        cell: ({ row }: { row: { original: ReceiptListRow } }) => (
          <ReceiptRowActions
            businessId={businessId}
            receiptId={row.original.id}
            receiptNumber={row.original.receipt_number}
            customerId={row.original.customer_id}
          />
        ),
      },
    ],
    [businessId, baseCurrency],
  );

  return (
    <CashDocumentTable
      businessId={businessId}
      baseCurrency={baseCurrency}
      rows={receipts}
      columns={columns}
      summary={summary}
      storageKey="sales-receipts"
      initialColumnVisibility={INITIAL_COLUMNS}
      columnLabels={COLUMN_LABELS}
      serverSnapshot={serverSnapshot}
      searchPlaceholder="Search receipts…"
      searchAriaLabel="Search receipts"
      filterAriaLabel="Filter receipts"
      fromAriaLabel="Receipt date from"
      toAriaLabel="Receipt date to"
      itemLabel="receipts"
      noResultsMessage="No receipts match these filters"
      noResultsSubtext="Try a different receipt number, customer, bank account, date range, or status."
      minWidth="min-w-[900px]"
      footer={footer}
    />
  );
}
