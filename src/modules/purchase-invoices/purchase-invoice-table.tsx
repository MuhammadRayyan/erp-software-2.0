"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, MoreHorizontal, Eye, FileEdit, Download, CircleDollarSign, BookOpenText, CheckCircle2, FileArchive, Ban } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState, type RowSelectionState } from "@tanstack/react-table";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, StatusFilterSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { PurchaseInvoiceStatus, PurchasePaymentStatus } from "./purchase-invoice-service";
import { DensityToggle } from "@/components/density-toggle";
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
  serverSnapshot,
}: {
  businessId: string;
  invoices: Omit<Row, "businessId">[];
  /** Server-loaded snapshot for the "purchase-invoices" storage key. */
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isPending, startTransition] = useTransition();
  const [confirmModal, setConfirmModal] = useState<{
    type: "void" | "post" | "delete";
    open: boolean;
  } | null>(null);
  const supplierOptions = useMemo(
    () => Array.from(new Map(invoices.map((invoice) => [invoice.supplier_id, invoice.supplier_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          invoices.flatMap((invoice) => invoice.projectIds.map((id, index) => [id, invoice.projectNames[index] ?? id] as const)),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
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
    () =>
      invoices
        .filter((invoice) => {
          const [kind, value] = status.split(":");
          const matchesStatus = !status || (kind === "document" ? invoice.document_status === value : invoice.paymentStatus === value);
          const matchesQuery = `${invoice.internal_number} ${invoice.supplier_name} ${invoice.supplier_invoice_number}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
          return (
            matchesStatus &&
            matchesQuery &&
            (!supplierId || invoice.supplier_id === supplierId) &&
            (!projectId || invoice.projectIds.includes(projectId))
          );
        })
        .map((invoice) => ({ ...invoice, businessId })),
    [invoices, projectId, query, status, supplierId, businessId],
  );
  const columns: any[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }: any) => (
          <input
            type="checkbox"
            className="size-4 rounded accent-primary cursor-pointer align-middle"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all bills"
          />
        ),
        cell: ({ row }: any) => (
          <input
            type="checkbox"
            className="size-4 rounded accent-primary cursor-pointer align-middle"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Select bill ${row.original.internal_number}`}
          />
        ),
        meta: { className: "w-8 text-center" },
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
        meta: { className: "w-16 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const bill = row.original;
          const canEdit = bill.document_status !== "void";
          const canPay = bill.document_status === "posted" && bill.balanceMinor > 0;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${bill.internal_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href={`/b/${bill.businessId}/purchases/invoices/${bill.id}`}>
                      <Eye className="size-4 text-muted-foreground" /> View Bill
                    </Link>
                  </DropdownMenuItem>
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
                  {canPay && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem permission="create" asChild>
                        <Link href={`/b/${bill.businessId}/purchases/payments/new?invoiceId=${bill.id}`}>
                          <CircleDollarSign className="size-4 text-muted-foreground" /> Record Payment
                        </Link>
                      </DropdownMenuItem>
                    </>
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
              <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <Link href={`/b/${bill.businessId}/purchases/invoices/${bill.id}`} aria-label={`Open ${bill.internal_number}`}>
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility: colVisibility,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
  });

  const statusValue = status.split(":")[1] as PurchaseInvoiceStatus | PurchasePaymentStatus | undefined;
  const statusText = statusLabel(statusValue ?? "");
  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setSupplierId("");
    setProjectId("");
  };
  const hasActiveFilter = Boolean(supplierId || projectId || status || query);

  const totalBilledStr = useMemo(() => {
    const activeRows = status === "document:void" ? rows : rows.filter((r) => r.document_status !== "void");
    return renderMultiCurrencyString(
      activeRows.map((r) => ({
        amount: r.total_minor,
        currency: r.currency_code,
        minorUnit: r.currency_minor_unit,
      }))
    );
  }, [rows, status]);
  const totalBalanceStr = useMemo(() => {
    const postedRows = rows.filter((r) => r.document_status === "posted");
    return renderMultiCurrencyString(
      postedRows.map((r) => ({
        amount: r.balanceMinor,
        currency: r.currency_code,
        minorUnit: r.currency_minor_unit,
      }))
    );
  }, [rows]);
  const overdueCount = useMemo(
    () => rows.filter((r) => r.paymentStatus === "overdue").length,
    [rows]
  );

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search purchase invoices…" ariaLabel="Search purchase invoices" />
        <ToolbarSelect
          value={supplierId}
          onChange={setSupplierId}
          ariaLabel="Filter by supplier"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={projectId}
          onChange={setProjectId}
          ariaLabel="Filter by project"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <StatusFilterSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter invoices"
          options={[
            { value: "", label: "All statuses" },
            { label: "Document", options: [
              { value: "document:draft", label: "Draft" },
              { value: "document:posted", label: "Posted" },
              { value: "document:void", label: "Void" },
            ]},
            { label: "Payment", options: [
              { value: "payment:unpaid", label: "Unpaid" },
              { value: "payment:partially_paid", label: "Partially Paid" },
              { value: "payment:paid", label: "Paid" },
              { value: "payment:overdue", label: "Overdue" },
            ]},
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {supplierId && (
            <FilterChip onRemove={() => setSupplierId("")}>
              Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}
            </FilterChip>
          )}
          {projectId && (
            <FilterChip onRemove={() => setProjectId("")}>
              Project: {projectOptions.find(([id]) => id === projectId)?.[1]}
            </FilterChip>
          )}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusText}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <DataTable 
        table={table}
        density={density}
        minWidth="min-w-[640px]" 
        noResultsMessage="No purchase invoices match" 
        onClearFilters={clearFilters}
      />

      {rows.length > 0 && (
        <TableTotalsBar
          filteredCount={rows.length}
          totalCount={invoices.length}
          itemLabel="bills"
          metrics={[
            { label: "Total Billed", value: totalBilledStr, tone: "primary" },
            {
              label: "Balance Payable",
              value: totalBalanceStr,
              tone: totalBalanceStr !== "—" && totalBalanceStr !== "0.00" ? "danger" : "default",
            },
            ...(overdueCount > 0
              ? [{ label: "Overdue", value: `${overdueCount} bills`, tone: "danger" as const }]
              : []),
          ]}
        />
      )}

      {(() => {
        const selectedBills = table.getSelectedRowModel().rows.map((r: any) => r.original as Row);
        const selectedCount = selectedBills.length;
        const selectedDrafts = selectedBills.filter((b) => b.document_status === "draft");

        const handleBatchPost = () => {
          startTransition(async () => {
            try {
              const draftIds = selectedDrafts.map((b) => b.id);
              const res = await batchPostPurchaseInvoicesAction(businessId, draftIds);
              if (res.successCount > 0) {
                toast.success(`Successfully posted ${res.successCount} ${res.successCount === 1 ? "bill" : "bills"}.`);
                setRowSelection({});
              }
              if (res.failedCount > 0) {
                toast.error(`Failed to post ${res.failedCount} ${res.failedCount === 1 ? "bill" : "bills"}: ${res.errors.join(", ")}`);
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
              }
              if (res.failedCount > 0) {
                toast.error(`Could not void ${res.failedCount} bills (they may have existing payment allocations).`);
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
                toast.success(`Deleted ${res.successCount} draft bills.`);
                setRowSelection({});
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
                    { header: "Total", accessorFn: (r: any) => (r.total_minor / 100).toFixed(2) },
                    { header: "Balance", accessorFn: (r: any) => (r.balanceMinor / 100).toFixed(2) },
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
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleBatchPost}
                  disabled={isPending}
                  className="h-8 gap-1.5 text-xs text-primary font-medium hover:bg-primary/10"
                >
                  <CheckCircle2 className="size-3.5" /> Post Drafts ({selectedDrafts.length})
                </Button>
              )}

              <Button
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
