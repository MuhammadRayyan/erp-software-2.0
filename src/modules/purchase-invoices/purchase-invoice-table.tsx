"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { debounce, useQueryStates } from "nuqs";
import { toast } from "sonner";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import { MoreHorizontal, FileEdit, Download, CircleDollarSign, BookOpenText, CheckCircle2, FileArchive, Ban } from "lucide-react";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
} from "@tanstack/react-table/legacy";
import { type RowSelectionState } from "@tanstack/react-table";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ListToolbar, SearchInput, ToolbarSelect, DateRangeFilter, StatusFilterSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { formatDate, formatMoney, minorToDecimalString } from "@/core/format";
import type { PurchaseInvoiceStatus, PurchasePaymentStatus } from "./purchase-invoice-service";
import type { InvoiceListSummary } from "@/modules/shared/list-query-helpers";
import {
  normalizeInvoiceStatusToken,
  purchaseInvoiceListParsers,
  resolveNextSortFromUpdater,
  toSortingState,
} from "@/lib/list-query-params";
import { DensityToggle } from "@/components/density-toggle";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";
import { BatchActionBar } from "@/components/batch-action-bar";
import { batchPostPurchaseInvoicesAction, batchVoidPurchaseInvoicesAction, batchDeletePurchaseInvoicesAction } from "./actions";
import { BatchConfirmModal } from "@/components/documents/batch-confirm-modal";
import { exportCsv } from "@/lib/export-csv";

type Row = {
  id: string;
  internal_number: string;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_minor: number;
  balanceMinor: number;
  currency_code: string;
  currency_minor_unit: number;
  document_status: PurchaseInvoiceStatus;
  paymentStatus: PurchasePaymentStatus | null;
  projectIds: string[];
  projectNames: string[];
  businessId: string; // Passed in mapped data for links
};

// Columns a user can toggle off. The "Bill" + "Supplier" columns stay
// always-on — they're the primary identifier and link target. The
// toggle set mirrors what manager.io exposes: date fields, money,
// and the document/payment status pills (advanced users hide them to
// fit more columns on small screens).
const COLUMN_LABELS: Record<string, string> = {
  supplierInvoice: "Supplier invoice #",
  date: "Date",
  due: "Due",
  total: "Total",
  balance: "Balance",
  payment: "Payment",
  document: "Document",
};

export function PurchaseInvoiceTable({
  businessId,
  invoices,
  summary,
  supplierOptions = [],
  projectOptions = [],
  serverSnapshot,
  footer,
}: {
  businessId: string;
  invoices: Omit<Row, "businessId">[];
  summary: InvoiceListSummary;
  supplierOptions?: Array<[string, string]>;
  projectOptions?: Array<[string, string]>;
  /** Server-loaded snapshot for the "purchase-invoices" storage key. */
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const canEditPerm = useActionPermission("edit");
  const canExportPerm = useActionPermission("export");
  const canCreatePerm = useActionPermission("create");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const { density } = useTableDensity(businessId);

  const [isPending, startTransition] = useTransition();
  const [urlState, setUrlState] = useQueryStates(purchaseInvoiceListParsers, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const query = urlState.q;
  const status = normalizeInvoiceStatusToken(urlState.status);
  const supplierId = urlState.supplierId;
  const projectId = urlState.projectId;
  const fromDate = urlState.from;
  const toDate = urlState.to;
  const sorting = useMemo(
    () => toSortingState(urlState.sort, urlState.dir),
    [urlState.sort, urlState.dir],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [confirmModal, setConfirmModal] = useState<{
    type: "void" | "post" | "delete";
    open: boolean;
  } | null>(null);
  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "purchase-invoices",
    businessId,
    serverSnapshot,
    initial: {
      supplierInvoice: true,
      date: true,
      due: true,
      total: true,
      balance: true,
      payment: true,
      document: true,
    },
    labels: COLUMN_LABELS,
  });
  const rows = useMemo(
    () => invoices.map((invoice) => ({ ...invoice, businessId })),
    [invoices, businessId],
  );
  const columns: any[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }: any) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
            aria-label="Select all bills"
          />
        ),
        cell: ({ row }: any) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            aria-label={`Select bill ${row.original.internal_number}`}
          />
        ),
        meta: { className: "w-9 text-center" },
        enableSorting: false,
      },
      {
        accessorKey: "internal_number",
        header: "Bill",
        cell: ({ row }: any) => (
          <Link href={`/b/${row.original.businessId}/purchases/invoices/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.internal_number}
          </Link>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: "Supplier",
        meta: { wrap: true },
      },
      {
        id: "supplierInvoice",
        accessorFn: (row: any) => row.supplier_invoice_number,
        header: "Supplier invoice",
        cell: ({ row }: any) => <span className="tabular text-muted-foreground">{row.original.supplier_invoice_number || "—"}</span>,
      },
      {
        id: "date",
        accessorFn: (row: any) => row.invoice_date,
        header: "Date",
        cell: ({ row }: any) => formatDate(row.original.invoice_date),
      },
      {
        id: "due",
        accessorFn: (row: any) => row.due_date,
        header: "Due",
        cell: ({ row }: any) => formatDate(row.original.due_date),
      },
      {
        id: "total",
        accessorFn: (row: any) => row.total_minor,
        header: "Total",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {formatMoney(row.original.total_minor, row.original.currency_code, row.original.currency_minor_unit)}
          </span>
        ),
      },
      {
        id: "balance",
        accessorFn: (row: any) => row.balanceMinor,
        header: "Balance",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {row.original.document_status === "posted" ? formatMoney(row.original.balanceMinor, row.original.currency_code, row.original.currency_minor_unit) : "—"}
          </span>
        ),
      },
      {
        id: "payment",
        accessorFn: (row: any) => row.paymentStatus,
        header: "Payment",
        cell: ({ row }: any) => row.original.paymentStatus ? <StatusBadge status={row.original.paymentStatus} /> : "—",
      },
      {
        id: "document",
        accessorFn: (row: any) => row.document_status,
        header: "Document",
        cell: ({ row }: any) => <StatusBadge status={row.original.document_status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const bill = row.original;
          const canEdit = bill.document_status !== "void" && bill.document_status !== "pending_approval" && (bill.document_status === "draft" || bill.balanceMinor === bill.total_minor);
          const canPay = bill.document_status === "posted" && bill.balanceMinor > 0;
          const hasUpper = (canEdit && canEditPerm) || canExportPerm;
          const hasLower = bill.document_status === "posted" && canCreatePerm;
          if (!hasUpper && !hasLower) return null;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${bill.internal_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {canEdit && (
                    <DropdownMenuItem permission="edit" asChild>
                      <Link href={`/b/${bill.businessId}/purchases/invoices/${bill.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Bill
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem permission="export" asChild>
                    <a href={`/api/businesses/${bill.businessId}/documents/purchase-invoice/${bill.id}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-4 text-muted-foreground" /> Download PDF
                    </a>
                  </DropdownMenuItem>
                  {hasUpper && hasLower && <DropdownMenuSeparator />}
                  {canPay && (
                    <DropdownMenuItem permission="create" asChild>
                      <Link href={`/b/${bill.businessId}/purchases/payments/new?invoiceId=${bill.id}`}>
                        <CircleDollarSign className="size-4 text-muted-foreground" /> Record Payment
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {bill.document_status === "posted" && (
                    <DropdownMenuItem permission="create" asChild>
                      <Link href={`/b/${bill.businessId}/purchases/debit-notes/new?invoiceId=${bill.id}`}>
                        <BookOpenText className="size-4 text-muted-foreground" /> Debit Note
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canCreatePerm, canEditPerm, canExportPerm],
  );

  const table = useTable({
    data: rows,
    columns,
    manualSorting: true,
    state: {
      sorting,
      columnVisibility: colVisibility,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const next = resolveNextSortFromUpdater(updater, urlState.sort, urlState.dir, "desc");
      void setUrlState({ sort: next.sort, dir: next.dir, page: 1 });
    },
    getCoreRowModel: createCoreRowModel(),
  });

  const statusValue = status.split(":")[1] as PurchaseInvoiceStatus | PurchasePaymentStatus | undefined;
  const statusText = status === "payment:open" ? "Open (All Unsettled)" : statusLabel(statusValue ?? "");
  const clearFilters = () => {
    void setUrlState({ q: "", status: "", supplierId: "", projectId: "", from: "", to: "", page: 1 });
  };
  const hasActiveFilter = Boolean(supplierId || projectId || fromDate || toDate || status || query);

  const totalBilledStr = useMemo(
    () =>
      renderMultiCurrencyString(
        summary.currencyTotals.map((c) => ({
          amount: c.totalMinor,
          currency: c.currencyCode,
          minorUnit: c.currencyMinorUnit,
        })),
      ),
    [summary.currencyTotals],
  );
  const totalBalanceStr = useMemo(
    () =>
      renderMultiCurrencyString(
        summary.currencyTotals
          .filter((c) => c.hasPosted)
          .map((c) => ({
            amount: c.balanceMinor,
            currency: c.currencyCode,
            minorUnit: c.currencyMinorUnit,
          })),
      ),
    [summary.currencyTotals],
  );
  const hasPositiveBalance = summary.currencyTotals.some((c) => c.balanceMinor > 0);
  const overdueCount = summary.overdueCount;

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={(value) => {
            void setUrlState({ q: value, page: 1 }, { limitUrlUpdates: value ? debounce(250) : undefined });
          }}
          placeholder="Search purchase invoices…"
          ariaLabel="Search purchase invoices"
        />
        <ToolbarSelect
          value={supplierId}
          onChange={(value) => void setUrlState({ supplierId: value, page: 1 })}
          ariaLabel="Filter by supplier"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={projectId}
          onChange={(value) => void setUrlState({ projectId: value, page: 1 })}
          ariaLabel="Filter by project"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(value) => void setUrlState({ from: value, page: 1 })}
          onToChange={(value) => void setUrlState({ to: value, page: 1 })}
          fromAriaLabel="Bill date from"
          toAriaLabel="Bill date to"
        />
        <StatusFilterSelect
          value={status}
          onChange={(value) => void setUrlState({ status: value, page: 1 })}
          ariaLabel="Filter invoices"
          options={[
            { value: "", label: "All statuses" },
            { label: "Document", options: [
              { value: "document:draft", label: "Draft" },
              { value: "document:pending_approval", label: "Pending Approval" },
              { value: "document:posted", label: "Posted" },
              { value: "document:void", label: "Void" },
            ]},
            { label: "Payment", options: [
              { value: "payment:open", label: "Open (All Unsettled)" },
              { value: "payment:unpaid", label: "Unpaid" },
              { value: "payment:partially_paid", label: "Partially Paid" },
              { value: "payment:paid", label: "Paid" },
              { value: "payment:overdue", label: "Overdue" },
            ]},
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename="purchase-invoices"
            data={rows}
            totalCount={summary.filteredTotal}
            columns={[
              { header: "Bill Number", accessorKey: "internal_number" },
              { header: "Supplier", accessorKey: "supplier_name" },
              { header: "Supplier Invoice", accessorKey: "supplier_invoice_number" },
              { header: "Date", accessorKey: "invoice_date" },
              { header: "Due Date", accessorKey: "due_date" },
              { header: "Currency", accessorKey: "currency_code" },
              { header: "Total", accessorFn: (r: Row) => minorToDecimalString(r.total_minor, r.currency_code, r.currency_minor_unit) },
              { header: "Balance", accessorFn: (r: Row) => minorToDecimalString(r.balanceMinor, r.currency_code, r.currency_minor_unit) },
              { header: "Document Status", accessorKey: "document_status" },
              { header: "Payment Status", accessorFn: (r: Row) => r.paymentStatus ?? "" },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {supplierId && (
            <FilterChip onRemove={() => void setUrlState({ supplierId: "", page: 1 })}>
              Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1] ?? supplierId}
            </FilterChip>
          )}
          {projectId && (
            <FilterChip onRemove={() => void setUrlState({ projectId: "", page: 1 })}>
              Project: {projectOptions.find(([id]) => id === projectId)?.[1] ?? projectId}
            </FilterChip>
          )}
          {fromDate && <FilterChip onRemove={() => void setUrlState({ from: "", page: 1 })}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => void setUrlState({ to: "", page: 1 })}>To: {formatDate(toDate)}</FilterChip>}
          {status && <FilterChip onRemove={() => void setUrlState({ status: "", page: 1 })}>Status: {statusText}</FilterChip>}
          {query && <FilterChip onRemove={() => void setUrlState({ q: "", page: 1 })}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[640px]"
          getRowHref={(bill: Row) => `/b/${businessId}/purchases/invoices/${bill.id}`}
          noResultsMessage="No purchase invoices match"
          onClearFilters={clearFilters}
        />

        {summary.filteredTotal > 0 && (
          <TableTotalsBar
            filteredCount={summary.filteredTotal}
            totalCount={summary.unfilteredTotal}
            itemLabel="bills"
            metrics={[
              { label: "Total Billed", value: totalBilledStr, tone: "primary" },
              {
                label: "Balance Payable",
                value: totalBalanceStr,
                tone: hasPositiveBalance ? "danger" : "default",
              },
              ...(overdueCount > 0
                ? [{ label: "Overdue", value: `${overdueCount} bills`, tone: "danger" as const }]
                : []),
            ]}
          />
        )}
        {footer}
      </ListTableCard>

      {(() => {
        const selectedBills = table.getSelectedRowModel().rows.map((r: any) => r.original as Row);
        const selectedCount = selectedBills.length;
        const selectedDrafts = selectedBills.filter((b) => b.document_status === "draft");

        const handleBatchPost = () => {
          startTransition(async () => {
            try {
              const draftIds = selectedDrafts.map((b) => b.id);
              const res = await batchPostPurchaseInvoicesAction(
                businessId,
                draftIds,
                mustSubmitForApproval ? "submit_approval" : "post",
              );
              const postedCount = res.postedCount ?? (res.pendingApprovalCount ? 0 : res.successCount);
              const pendingCount = res.pendingApprovalCount ?? 0;
              if (postedCount > 0 && pendingCount > 0) {
                toast.success(
                  `Posted ${postedCount} draft ${postedCount === 1 ? "bill" : "bills"} to the General Ledger and submitted ${pendingCount} for approval.`,
                );
              } else if (pendingCount > 0) {
                toast.success(
                  `Submitted ${pendingCount} draft ${pendingCount === 1 ? "bill" : "bills"} for approval.`,
                );
              } else if (postedCount > 0) {
                toast.success(
                  `Successfully posted ${postedCount} ${postedCount === 1 ? "bill" : "bills"}.`,
                );
              }
              if (res.successCount > 0) {
                setRowSelection({});
                broadcastLiveRefresh();
                router.refresh();
              }
              if (res.failedCount > 0) {
                const detail = res.errors
                  .map((e) => (e.number ? `${e.number}: ${e.error}` : e.error))
                  .join(", ");
                toast.error(
                  detail
                    ? `Failed to process ${res.failedCount} ${res.failedCount === 1 ? "bill" : "bills"}: ${detail}`
                    : `Failed to process ${res.failedCount} ${res.failedCount === 1 ? "bill" : "bills"}.`,
                );
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Batch post failed.");
            }
          });
        };

        const handleDownloadZip = async () => {
          try {
            toast.info("Generating batch PDF archive...");
            const res = await fetch(`/api/businesses/${businessId}/documents/purchase-invoice/batch-pdf`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentIds: selectedBills.map((b) => b.id) }),
            });
            if (!res.ok) throw new Error("Batch download failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `purchase-bills-batch-${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Download started!");
          } catch {
            toast.error("Failed to generate batch PDF archive.");
          }
        };

        const handleBatchVoid = () => {
          startTransition(async () => {
            try {
              const res = await batchVoidPurchaseInvoicesAction(businessId, selectedBills.map((b) => b.id));
              if (res.successCount > 0) {
                toast.success(`Successfully voided ${res.successCount} ${res.successCount === 1 ? "bill" : "bills"}.`);
                setRowSelection({});
                setConfirmModal(null);
                broadcastLiveRefresh();
                router.refresh();
              }
              if (res.failedCount > 0) {
                const detail = res.errors
                  .map((e) => (e.number ? `${e.number}: ${e.error}` : e.error))
                  .join(", ");
                toast.error(
                  detail
                    ? `Could not void ${res.failedCount} ${res.failedCount === 1 ? "bill" : "bills"}: ${detail}`
                    : `Could not void ${res.failedCount} ${res.failedCount === 1 ? "bill" : "bills"}.`,
                );
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Batch void failed.");
            }
          });
        };

        const handleBatchDelete = () => {
          startTransition(async () => {
            try {
              const draftIds = selectedDrafts.map((b) => b.id);
              const res = await batchDeletePurchaseInvoicesAction(businessId, draftIds);
              if (res.successCount > 0) {
                toast.success(`Deleted ${res.successCount} draft ${res.successCount === 1 ? "bill" : "bills"}.`);
                setRowSelection({});
                setConfirmModal(null);
                broadcastLiveRefresh();
                router.refresh();
              }
              if (res.failedCount > 0) {
                const detail = res.errors
                  .map((e) => (e.number ? `${e.number}: ${e.error}` : e.error))
                  .join(", ");
                toast.error(
                  detail
                    ? `Failed to delete ${res.failedCount} draft ${res.failedCount === 1 ? "bill" : "bills"}: ${detail}`
                    : `Failed to delete ${res.failedCount} draft ${res.failedCount === 1 ? "bill" : "bills"}.`,
                );
                setConfirmModal(null);
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Batch delete failed.");
            }
          });
        };

        return (
          <>
            <BatchActionBar
              selectedCount={selectedCount}
              totalCount={rows.length}
              onClearSelection={() => setRowSelection({})}
              onSelectAll={() => table.toggleAllRowsSelected(true)}
              onExportSelected={() => {
                exportCsv(
                  `purchase-invoices-selected-${new Date().toISOString().slice(0, 10)}.csv`,
                  [
                    { header: "Bill Number", accessorKey: "internal_number" },
                    { header: "Supplier", accessorKey: "supplier_name" },
                    { header: "Supplier Invoice", accessorKey: "supplier_invoice_number" },
                    { header: "Date", accessorKey: "invoice_date" },
                    { header: "Due Date", accessorKey: "due_date" },
                    { header: "Currency", accessorKey: "currency_code" },
                    { header: "Total", accessorFn: (r: any) => minorToDecimalString(r.total_minor, r.currency_code, r.currency_minor_unit) },
                    { header: "Balance", accessorFn: (r: any) => minorToDecimalString(r.balanceMinor, r.currency_code, r.currency_minor_unit) },
                    { header: "Document Status", accessorKey: "document_status" },
                    { header: "Payment Status", accessorKey: "paymentStatus" },
                  ],
                  selectedBills
                );
              }}
              onPrintSelected={() => window.print()}
              onDeleteSelected={selectedDrafts.length > 0 && selectedDrafts.length === selectedCount ? () => setConfirmModal({ type: "delete", open: true }) : undefined}
              deleteLabel={`Delete Drafts (${selectedDrafts.length})`}
              isDeleting={isPending}
            >
              {selectedDrafts.length > 0 && (
                <Button
                  permission={mustSubmitForApproval ? "edit" : "post"}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleBatchPost}
                  disabled={isPending}
                  className="h-8 gap-1.5 text-xs text-primary font-medium hover:bg-primary/10"
                >
                  <CheckCircle2 className="size-3.5" />{" "}
                  {mustSubmitForApproval
                    ? `Submit for Approval (${selectedDrafts.length})`
                    : `Post Drafts (${selectedDrafts.length})`}
                </Button>
              )}

              <Button
                permission="export"
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleDownloadZip}
                disabled={isPending}
                className="h-8 gap-1.5 text-xs"
              >
                <FileArchive className="size-3.5" /> Download ZIP
              </Button>

              <Button permission={"delete"}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmModal({ type: "void", open: true })}
                disabled={isPending}
                className="h-8 gap-1.5 text-xs text-danger hover:text-danger hover:bg-danger/10"
              >
                <Ban className="size-3.5" /> Void Selected
              </Button>
            </BatchActionBar>

            {confirmModal && confirmModal.type === "void" && (
              <BatchConfirmModal
                open={confirmModal.open}
                onOpenChange={(open) => setConfirmModal(open ? confirmModal : null)}
                title="Void Selected Bills"
                description="Are you sure you want to void the selected purchase bills? Any posted bills will have their General Ledger entries reversed atomically. Bills with payment allocations cannot be voided."
                confirmLabel="Void Bills"
                confirmTone="danger"
                itemCount={selectedCount}
                itemLabel="purchase bills"
                onConfirm={handleBatchVoid}
                isPending={isPending}
              />
            )}

            {confirmModal && confirmModal.type === "delete" && (
              <BatchConfirmModal
                open={confirmModal.open}
                onOpenChange={(open) => setConfirmModal(open ? confirmModal : null)}
                title="Delete Draft Bills"
                description="Are you sure you want to permanently delete the selected draft purchase bills? This action cannot be undone."
                confirmLabel="Delete Drafts"
                confirmTone="danger"
                itemCount={selectedDrafts.length}
                itemLabel="draft bills"
                onConfirm={handleBatchDelete}
                isPending={isPending}
              />
            )}
          </>
        );
      })()}
    </>
  );
}
