"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatDate, formatMoney } from "@/core/format";
import { CashDocumentTable } from "@/modules/shared/cash-document-table";
import type { CashDocumentListSummary } from "@/modules/shared/list-query-helpers";
import type { SupplierPaymentListRow } from "./supplier-payment-service";
import { SupplierPaymentRowActions } from "./supplier-payment-row-actions";

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

export function SupplierPaymentTable({
  businessId,
  baseCurrency,
  payments,
  summary,
  serverSnapshot,
  footer,
}: {
  businessId: string;
  baseCurrency: string;
  payments: SupplierPaymentListRow[];
  summary: CashDocumentListSummary;
  serverSnapshot?: ColumnVisibility;
  footer?: ReactNode;
}) {
  const columns = useMemo(
    () => [
      {
        accessorKey: "payment_number",
        header: "Payment",
        cell: ({ row }: { row: { original: SupplierPaymentListRow } }) => (
          <Link
            href={`/b/${businessId}/purchases/payments/${row.original.id}`}
            className="tabular font-medium text-primary hover:underline"
          >
            {row.original.payment_number}
          </Link>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: "Supplier",
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: SupplierPaymentListRow } }) => formatDate(row.original.date),
      },
      {
        accessorKey: "bank_account_name",
        header: "Bank / Cash",
      },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }: { row: { original: SupplierPaymentListRow } }) => (
          <span className="text-muted-foreground">{row.original.reference || "—"}</span>
        ),
      },
      {
        accessorKey: "amount_minor",
        header: "Amount",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: SupplierPaymentListRow } }) => (
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
        cell: ({ row }: { row: { original: SupplierPaymentListRow } }) => (
          <span className="money">{formatMoney(row.original.base_amount_minor, baseCurrency)}</span>
        ),
      },
      {
        accessorKey: "document_status",
        header: "Status",
        cell: ({ row }: { row: { original: SupplierPaymentListRow } }) => (
          <StatusBadge status={row.original.document_status} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-14 text-right" },
        cell: ({ row }: { row: { original: SupplierPaymentListRow } }) => (
          <SupplierPaymentRowActions
            businessId={businessId}
            paymentId={row.original.id}
            paymentNumber={row.original.payment_number}
            supplierId={row.original.supplier_id}
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
      rows={payments}
      columns={columns}
      summary={summary}
      storageKey="purchase-payments"
      initialColumnVisibility={INITIAL_COLUMNS}
      columnLabels={COLUMN_LABELS}
      serverSnapshot={serverSnapshot}
      searchPlaceholder="Search supplier payments…"
      searchAriaLabel="Search supplier payments"
      filterAriaLabel="Filter supplier payments"
      fromAriaLabel="Payment date from"
      toAriaLabel="Payment date to"
      itemLabel="payments"
      noResultsMessage="No supplier payments match these filters"
      noResultsSubtext="Try a different payment number, supplier, bank account, date range, or status."
      minWidth="min-w-[1000px]"
      footer={footer}
    />
  );
}
