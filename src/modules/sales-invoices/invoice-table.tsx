"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { debounce, useQueryStates } from "nuqs";
import { toast } from "sonner";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import { ChevronRight, MoreHorizontal, Eye, FileEdit, Download, CircleDollarSign, CheckCircle2, FileArchive, Mail, Ban } from "lucide-react";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
} from "@tanstack/react-table/legacy";
import { type RowSelectionState } from "@tanstack/react-table";
import { useColumns } from "@/components/columns-dropdown";
import { ListToolbar, SearchInput, ToolbarSelect, DateRangeFilter, StatusFilterSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate, formatMoney } from "@/core/format";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { DocumentStatusBadge, PaymentStatusBadge } from "./invoice-status";
import type { DocumentStatus, PaymentStatus } from "./invoice-service";
import type { InvoiceListSummary } from "@/modules/shared/list-query-helpers";
import {
  invoiceListParsers,
  normalizeInvoiceStatusToken,
  resolveNextSortFromUpdater,
  toSortingState,
} from "@/lib/list-query-params";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";
import { BatchActionBar } from "@/components/batch-action-bar";
import { batchPostInvoicesAction, batchVoidInvoicesAction, batchDeleteInvoicesAction } from "./actions";
import { BatchEmailModal } from "./batch-email-modal";
import { BatchConfirmModal } from "@/components/documents/batch-confirm-modal";
import { exportCsv } from "@/lib/export-csv";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
  invoiceDate: string;
  dueDate: string;
  totalMinor: number;
  balanceMinor: number;
  currencyCode: string;
  currencyMinorUnit: number;
  documentStatus: DocumentStatus;
  paymentStatus: PaymentStatus | null;
  projectIds: string[];
  projectNames: string[];
};

const filterLabels: Record<string, string> = {
  "document:draft": "Draft",
  "document:pending_approval": "Pending Approval",
  "document:posted": "Posted",
  "document:void": "Void",
  "payment:open": "Open (All Unsettled)",
  "payment:unpaid": "Unpaid",
  "payment:partially_paid": "Partially paid",
  "payment:paid": "Paid",
  "payment:overdue": "Overdue",
};

export function InvoiceTable({
  businessId,
  invoices,
  summary,
  customerOptions = [],
  projectOptions = [],
  customFields = [],
  customValues = {},
  serverSnapshot,
  footer,
}: {
  businessId: string;
  invoices: InvoiceRow[];
  summary: InvoiceListSummary;
  customerOptions?: Array<[string, string]>;
  projectOptions?: Array<[string, string]>;
  customFields?: CustomFieldColumn[];
  customValues?: Record<string, Record<string, string>>;
  serverSnapshot?: ColumnVisibility;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const { density } = useTableDensity(businessId);

  const [isPending, startTransition] = useTransition();
  const [urlState, setUrlState] = useQueryStates(invoiceListParsers, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const query = urlState.q;
  const statusFilter = normalizeInvoiceStatusToken(urlState.status);
  const customerFilter = urlState.customerId;
  const projectFilter = urlState.projectId;
  const fromDate = urlState.from;
  const toDate = urlState.to;
  const sorting = useMemo(
    () => toSortingState(urlState.sort, urlState.dir),
    [urlState.sort, urlState.dir],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    type: "void" | "post" | "delete";
    open: boolean;
  } | null>(null);

  const rows = useMemo(
    () => invoices.map((invoice) => ({ ...invoice, businessId, customValues: customValues[invoice.id] })),
    [invoices, businessId, customValues],
  );

  const initialColumns = useMemo(() => {
    const base = { dueDate: true, balanceMinor: true, paymentStatus: true, documentStatus: true } as Record<string, boolean>;
    for (const field of customFields) base[field.id] = false;
    return base;
  }, [customFields]);

  const columnLabels = useMemo(() => {
    const base = { dueDate: "Due date", balanceMinor: "Balance", paymentStatus: "Payment status", documentStatus: "Document status" } as Record<string, string>;
    for (const field of customFields) base[field.id] = field.name;
    return base;
  }, [customFields]);

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "sales-invoices",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: columnLabels,
  });

  const columns: any[] = useMemo(() => {
    const cols: any[] = [
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
            aria-label="Select all invoices"
          />
        ),
        cell: ({ row }: any) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            aria-label={`Select invoice ${row.original.invoiceNumber}`}
          />
        ),
        meta: { className: "w-9 text-center" },
        enableSorting: false,
      },
      {
        accessorKey: "invoiceNumber",
        header: "Invoice",
        cell: ({ row }: any) => (
          <Link href={`/b/${row.original.businessId}/sales/invoices/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      {
        accessorKey: "customerName",
        header: "Customer",
      },
      {
        accessorKey: "invoiceDate",
        header: "Invoice Date",
        cell: ({ row }: any) => formatDate(row.original.invoiceDate, { day: "2-digit", month: "short", year: "numeric" }),
      },
      {
        accessorKey: "dueDate",
        header: "Due Date",
        cell: ({ row }: any) => formatDate(row.original.dueDate, { day: "2-digit", month: "short", year: "numeric" }),
      },
      {
        accessorKey: "totalMinor",
        header: "Total",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money">
            {formatMoney(row.original.totalMinor, row.original.currencyCode, row.original.currencyMinorUnit)}
          </span>
        ),
      },
      {
        accessorKey: "balanceMinor",
        header: "Balance",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money">
            {row.original.documentStatus === "posted" ? formatMoney(row.original.balanceMinor, row.original.currencyCode, row.original.currencyMinorUnit) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment Status",
        cell: ({ row }: any) => row.original.paymentStatus ? <PaymentStatusBadge status={row.original.paymentStatus} /> : <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "documentStatus",
        header: "Document Status",
        cell: ({ row }: any) => <DocumentStatusBadge status={row.original.documentStatus} />,
      },
    ];

    for (const field of customFields) {
      cols.push({
        accessorKey: field.id,
        header: field.name,
        enableSorting: false,
        cell: ({ row }: any) => {
          const val = row.original.customValues?.[field.id];
          return <span className="text-muted-foreground">{formatCustomFieldValue(field.fieldType, val)}</span>;
        }
      });
    }

    cols.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-16 text-right" },
      enableSorting: false,
      cell: ({ row }: any) => {
        const inv = row.original;
        const canEdit = inv.documentStatus !== "void" && inv.documentStatus !== "pending_approval";
        const canReceive = inv.documentStatus === "posted" && inv.balanceMinor > 0;
        return (
          <div className="flex items-center justify-end gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${inv.invoiceNumber}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/b/${inv.businessId}/sales/invoices/${inv.id}`}>
                    <Eye className="size-4 text-muted-foreground" /> View Details
                  </Link>
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem permission="edit" asChild>
                    <Link href={`/b/${inv.businessId}/sales/invoices/${inv.id}/edit`}>
                      <FileEdit className="size-4 text-muted-foreground" /> Edit Invoice
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem permission="export" asChild>
                  <a href={`/api/businesses/${inv.businessId}/documents/sales-invoice/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                    <Download className="size-4 text-muted-foreground" /> Download PDF
                  </a>
                </DropdownMenuItem>
                {canReceive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem permission="create" asChild>
                      <Link href={`/b/${inv.businessId}/sales/receipts/new?invoiceId=${inv.id}`}>
                        <CircleDollarSign className="size-4 text-muted-foreground" /> Record Receipt
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              <Link href={`/b/${inv.businessId}/sales/invoices/${inv.id}`} aria-label={`Open ${inv.invoiceNumber}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        );
      },
    });

    return cols;
  }, [customFields]);

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

  const clearFilters = () => {
    void setUrlState({ q: "", status: "", customerId: "", projectId: "", from: "", to: "", page: 1 });
  };
  const hasActiveFilter = Boolean(customerFilter || projectFilter || fromDate || toDate || statusFilter || query);

  const totalInvoicedStr = useMemo(
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

  return <>
    <ListToolbar>
      <SearchInput
        value={query}
        onChange={(value) => {
          void setUrlState({ q: value, page: 1 }, { limitUrlUpdates: value ? debounce(250) : undefined });
        }}
        placeholder="Search invoices…"
        ariaLabel="Search invoices"
      />
      <ToolbarSelect
        value={customerFilter}
        onChange={(value) => void setUrlState({ customerId: value, page: 1 })}
        ariaLabel="Filter by customer"
        className="min-w-36 max-w-52"
        options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]}
      />
      <ToolbarSelect
        value={projectFilter}
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
        fromAriaLabel="Invoice date from"
        toAriaLabel="Invoice date to"
      />
      <StatusFilterSelect
        value={statusFilter}
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
        <DensityToggle businessId={businessId} />
        {dropdown}
      </div>
    </ListToolbar>
    
    {hasActiveFilter && (
      <ActiveFiltersRow onClearAll={clearFilters}>
        {customerFilter && <FilterChip onRemove={() => void setUrlState({ customerId: "", page: 1 })}>Customer: {customerOptions.find(([id]) => id === customerFilter)?.[1] ?? customerFilter}</FilterChip>}
        {projectFilter && <FilterChip onRemove={() => void setUrlState({ projectId: "", page: 1 })}>Project: {projectOptions.find(([id]) => id === projectFilter)?.[1] ?? projectFilter}</FilterChip>}
        {fromDate && <FilterChip onRemove={() => void setUrlState({ from: "", page: 1 })}>From: {formatDate(fromDate)}</FilterChip>}
        {toDate && <FilterChip onRemove={() => void setUrlState({ to: "", page: 1 })}>To: {formatDate(toDate)}</FilterChip>}
        {statusFilter && <FilterChip onRemove={() => void setUrlState({ status: "", page: 1 })}>Status: {filterLabels[statusFilter] ?? statusFilter}</FilterChip>}
        {query && <FilterChip onRemove={() => void setUrlState({ q: "", page: 1 })}>Search: {query}</FilterChip>}
      </ActiveFiltersRow>
    )}
    
    <ListTableCard>
      <DataTable 
        table={table}
        density={density}
        framed={false}
        minWidth="min-w-[1100px]" 
        noResultsMessage="No invoices match these filters"
        noResultsSubtext="Try a different invoice number, customer, date range, or status."
        onClearFilters={clearFilters}
      />

      {summary.filteredTotal > 0 && (
        <TableTotalsBar
          filteredCount={summary.filteredTotal}
          totalCount={summary.unfilteredTotal}
          itemLabel="invoices"
          metrics={[
            { label: "Total Invoiced", value: totalInvoicedStr, tone: "primary" },
            {
              label: "Balance Due",
              value: totalBalanceStr,
              tone: hasPositiveBalance ? "danger" : "default",
            },
            ...(overdueCount > 0
              ? [{ label: "Overdue", value: `${overdueCount} overdue`, tone: "danger" as const }]
              : []),
          ]}
        />
      )}
      {footer}
    </ListTableCard>

    {(() => {
      const selectedInvoices: InvoiceRow[] = table.getSelectedRowModel().rows.map((r: any) => r.original);
      const selectedDrafts = selectedInvoices.filter((i) => i.documentStatus === "draft");
      const selectedCount = selectedInvoices.length;

      const handleBatchPost = () => {
        startTransition(async () => {
          try {
            const draftIds = selectedDrafts.map((i) => i.id);
            const res = await batchPostInvoicesAction(
              businessId,
              draftIds,
              mustSubmitForApproval ? "submit_approval" : "post",
            );
            const postedCount = res.postedCount ?? (res.pendingApprovalCount ? 0 : res.successCount);
            const pendingCount = res.pendingApprovalCount ?? 0;
            if (postedCount > 0 && pendingCount > 0) {
              toast.success(
                `Posted ${postedCount} draft ${postedCount === 1 ? "invoice" : "invoices"} to the General Ledger and submitted ${pendingCount} for approval.`,
              );
            } else if (pendingCount > 0) {
              toast.success(
                `Submitted ${pendingCount} draft ${pendingCount === 1 ? "invoice" : "invoices"} for approval.`,
              );
            } else if (postedCount > 0) {
              toast.success(
                `Posted ${postedCount} draft ${postedCount === 1 ? "invoice" : "invoices"} to the General Ledger.`,
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
                  ? `Failed to process ${res.failedCount} ${res.failedCount === 1 ? "invoice" : "invoices"}: ${detail}`
                  : `Failed to process ${res.failedCount} ${res.failedCount === 1 ? "invoice" : "invoices"}.`,
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
          const res = await fetch(`/api/businesses/${businessId}/documents/sales-invoice/batch-pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentIds: selectedInvoices.map((i) => i.id) }),
          });
          if (!res.ok) throw new Error("Batch download failed");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `sales-invoices-batch-${new Date().toISOString().slice(0, 10)}.zip`;
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
            const res = await batchVoidInvoicesAction(businessId, selectedInvoices.map((i) => i.id));
            if (res.successCount > 0) {
              toast.success(`Successfully voided ${res.successCount} ${res.successCount === 1 ? "invoice" : "invoices"}.`);
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
                  ? `Could not void ${res.failedCount} ${res.failedCount === 1 ? "invoice" : "invoices"}: ${detail}`
                  : `Could not void ${res.failedCount} ${res.failedCount === 1 ? "invoice" : "invoices"}.`,
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
            const draftIds = selectedDrafts.map((i) => i.id);
            const res = await batchDeleteInvoicesAction(businessId, draftIds);
            if (res.successCount > 0) {
              toast.success(`Deleted ${res.successCount} draft ${res.successCount === 1 ? "invoice" : "invoices"}.`);
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
                  ? `Failed to delete ${res.failedCount} draft ${res.failedCount === 1 ? "invoice" : "invoices"}: ${detail}`
                  : `Failed to delete ${res.failedCount} draft ${res.failedCount === 1 ? "invoice" : "invoices"}.`,
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
                `sales-invoices-selected-${new Date().toISOString().slice(0, 10)}.csv`,
                [
                  { header: "Invoice Number", accessorKey: "invoiceNumber" },
                  { header: "Customer", accessorKey: "customerName" },
                  { header: "Date", accessorKey: "invoiceDate" },
                  { header: "Due Date", accessorKey: "dueDate" },
                  { header: "Currency", accessorKey: "currencyCode" },
                  { header: "Total", accessorFn: (r: any) => (r.totalMinor / 100).toFixed(2) },
                  { header: "Balance", accessorFn: (r: any) => (r.balanceMinor / 100).toFixed(2) },
                  { header: "Document Status", accessorKey: "documentStatus" },
                  { header: "Payment Status", accessorKey: "paymentStatus" },
                ],
                selectedInvoices
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
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEmailModalOpen(true)}
              disabled={isPending}
              className="h-8 gap-1.5 text-xs"
            >
              <Mail className="size-3.5" /> Email Invoices
            </Button>

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

          <BatchEmailModal
            open={emailModalOpen}
            onOpenChange={setEmailModalOpen}
            businessId={businessId}
            invoices={selectedInvoices.map((inv) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              customerName: inv.customerName,
              customerEmail: inv.customerEmail,
              totalMinor: inv.totalMinor,
              currencyCode: inv.currencyCode,
            }))}
            onSuccess={() => setRowSelection({})}
          />

          {confirmModal && confirmModal.type === "void" && (
            <BatchConfirmModal
              open={confirmModal.open}
              onOpenChange={(open) => setConfirmModal(open ? confirmModal : null)}
              title="Void Selected Invoices"
              description="Are you sure you want to void the selected invoices? Any posted invoices will have their General Ledger entries and tax records reversed atomically. Invoices with payment allocations cannot be voided."
              confirmLabel="Void Invoices"
              confirmTone="danger"
              itemCount={selectedCount}
              itemLabel="invoices"
              onConfirm={handleBatchVoid}
              isPending={isPending}
            />
          )}

          {confirmModal && confirmModal.type === "delete" && (
            <BatchConfirmModal
              open={confirmModal.open}
              onOpenChange={(open) => setConfirmModal(open ? confirmModal : null)}
              title="Delete Draft Invoices"
              description="Are you sure you want to permanently delete the selected draft invoices? This action cannot be undone."
              confirmLabel="Delete Drafts"
              confirmTone="danger"
              itemCount={selectedDrafts.length}
              itemLabel="draft invoices"
              onConfirm={handleBatchDelete}
              isPending={isPending}
            />
          )}
        </>
      );
    })()}
  </>;
}
