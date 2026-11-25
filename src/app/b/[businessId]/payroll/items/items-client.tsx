"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { Plus, MoreHorizontal, FileEdit, CheckCircle2, Ban } from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useTableDensity } from "@/components/use-table-density";
import { ClientListPagination } from "@/components/list-pagination";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { type PayslipItemRecord } from "@/modules/payroll/services/payroll-service";
import { savePayslipItemAction } from "@/modules/payroll/actions/payroll-actions";
import { ItemDialog } from "./item-dialog";

interface ItemsClientProps {
  businessId: string;
  items: PayslipItemRecord[];
  accounts: Array<{ id: string; name: string; type: string; subtype: string }>;
}

const ITEM_COLUMN_LABELS: Record<string, string> = {
  type: "Type",
  accountName: "GL Account",
  description: "Description",
  isActive: "Status",
};

export function ItemsClient({ businessId, items, accounts }: ItemsClientProps) {
  const router = useRouter();
  const { density } = useTableDensity(businessId);
  const canEdit = useActionPermission("edit");
  const {
    query,
    type: typeFilter,
    status: statusFilter,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PayslipItemRecord | null>(null);

  const initialColumns = useMemo(
    () => ({
      type: true,
      accountName: true,
      description: true,
      isActive: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "payroll-items",
    businessId,
    initial: initialColumns,
    labels: ITEM_COLUMN_LABELS,
  });

  const handleToggleItemActive = useCallback(
    async (item: PayslipItemRecord) => {
      try {
        const res = await savePayslipItemAction(businessId, {
          id: item.id,
          name: item.name,
          type: item.type,
          accountId: item.accountId,
          description: item.description,
          isActive: !item.isActive,
        });
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(item.isActive ? `${item.name} marked inactive.` : `${item.name} marked active.`);
          router.refresh();
        }
      } catch {
        toast.error("Failed to update status.");
      }
    },
    [businessId, router],
  );

  const filteredItems = useMemo(() => {
    const term = query.toLowerCase().trim();
    return items.filter((i) => {
      if (typeFilter && i.type !== typeFilter) return false;
      if (statusFilter === "active" && !i.isActive) return false;
      if (statusFilter === "inactive" && i.isActive) return false;
      if (!term) return true;
      return (
        i.name.toLowerCase().includes(term) ||
        (i.accountName && i.accountName.toLowerCase().includes(term)) ||
        (i.description && i.description.toLowerCase().includes(term))
      );
    });
  }, [items, query, typeFilter, statusFilter]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Item Name",
        cell: ({ row }: { row: { original: PayslipItemRecord } }) => (
          <button
            type="button"
            onClick={() => {
              setSelectedItem(row.original);
              setDialogOpen(true);
            }}
            className="text-left font-medium text-primary hover:underline"
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }: { row: { original: PayslipItemRecord } }) =>
          row.original.type === "earnings" ? (
            <Badge tone="success" className="text-xs">Earnings</Badge>
          ) : (
            <Badge tone="warning" className="text-xs">Deduction</Badge>
          ),
      },
      {
        accessorKey: "accountName",
        header: "GL Account",
        cell: ({ row }: { row: { original: PayslipItemRecord } }) => (
          <span className="font-medium text-foreground">{row.original.accountName || row.original.accountId}</span>
        ),
      },
      {
        accessorKey: "description",
        header: "Default Description",
        cell: ({ row }: { row: { original: PayslipItemRecord } }) => (
          <span className="text-xs text-muted-foreground">{row.original.description || "—"}</span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }: { row: { original: PayslipItemRecord } }) => (
          <StatusBadge status={row.original.isActive ? "active" : "inactive"} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { className: "w-12 text-right" },
        cell: ({ row }: { row: { original: PayslipItemRecord } }) => {
          if (!canEdit) return null;
          const item = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    aria-label={`Actions for ${item.name}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    permission="edit"
                    onClick={() => {
                      setSelectedItem(item);
                      setDialogOpen(true);
                    }}
                  >
                    <FileEdit className="size-4 text-muted-foreground" /> Edit Item
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem permission="edit" onClick={() => handleToggleItemActive(item)}>
                    {item.isActive ? (
                      <>
                        <Ban className="size-4 text-danger" />
                        <span className="text-danger">Mark Inactive</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-4 text-success" />
                        <span className="text-success">Mark Active</span>
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canEdit, handleToggleItemActive],
  );

  const { pagination, paginationInfo } = buildPagination(filteredItems.length);

  const table = useTable({
    data: filteredItems,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const earningsCount = useMemo(() => filteredItems.filter((i) => i.type === "earnings").length, [filteredItems]);
  const deductionsCount = useMemo(() => filteredItems.filter((i) => i.type === "deduction").length, [filteredItems]);

  const clearFilters = resetFilters;

  const hasActiveFilter = Boolean(query || typeFilter || statusFilter);

  return (
    <>
      <PageHeader
        title="Payslip Items"
        description="Earnings and deduction items mapped to General Ledger accounts."
      >
        <Button
          permission="create"
          onClick={() => {
            setSelectedItem(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" /> New Item
        </Button>
      </PageHeader>

      <ListToolbar>
        <SearchInput
          value={query}
          onChange={(v) => setFilter("q", v)}
          placeholder="Search item name, GL account..."
          ariaLabel="Search compensation items"
        />
        <ToolbarSelect
          value={typeFilter}
          onChange={(v) => setFilter("type", v)}
          ariaLabel="Filter by type"
          options={[
            { value: "", label: "All types" },
            { value: "earnings", label: "Earnings" },
            { value: "deduction", label: "Deductions" },
          ]}
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={(v) => setFilter("status", v)}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active only" },
            { value: "inactive", label: "Inactive only" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <ExportCsvButton
            size="sm"
            filename="payslip-items"
            data={filteredItems}
            columns={[
              { header: "Name", accessorKey: "name" },
              { header: "Type", accessorFn: (r) => (r.type === "earnings" ? "Earnings" : "Deduction") },
              { header: "GL Account", accessorFn: (r) => r.accountName ?? "" },
              { header: "Description", accessorFn: (r) => r.description ?? "" },
              { header: "Status", accessorFn: (r) => (r.isActive ? "Active" : "Inactive") },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {typeFilter && (
            <FilterChip onRemove={() => setFilter("type", "")}>
              Type: {typeFilter === "earnings" ? "Earnings" : "Deductions"}
            </FilterChip>
          )}
          {statusFilter && (
            <FilterChip onRemove={() => setFilter("status", "")}>
              Status: {statusFilter === "active" ? "Active only" : "Inactive only"}
            </FilterChip>
          )}
          {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[760px]"
          onRowClick={canEdit ? (item) => {
            setSelectedItem(item);
            setDialogOpen(true);
          } : undefined}
          noResultsMessage={items.length === 0 ? "No payslip items configured yet." : "No payslip items match"}
          onClearFilters={hasActiveFilter ? clearFilters : undefined}
        />
        {filteredItems.length > 0 && (
          <TableTotalsBar
            filteredCount={filteredItems.length}
            totalCount={items.length}
            itemLabel="items"
            metrics={[
              { label: "Earnings", value: earningsCount, tone: "success" },
              { label: "Deductions", value: deductionsCount, tone: "warning" },
            ]}
          />
        )}
        <ClientListPagination
          info={paginationInfo}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ListTableCard>

      <ItemDialog
        businessId={businessId}
        item={selectedItem}
        accounts={accounts}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
