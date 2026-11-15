"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Landmark,
  Plus,
  Send,
} from "lucide-react";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { ClientListPagination, useTablePagination } from "@/components/list-pagination";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import {
  DialogRoot,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ActiveFiltersRow, DateRangeFilter, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { FormError } from "@/components/form-error";
import { formatDate, formatMoney } from "@/core/format";
import type { PdcMaturitySummary, PdcRecord } from "@/modules/banking/pdc-service";
import {
  bouncePdcAction,
  cancelPdcAction,
  clearPdcAction,
  createPdcAction,
  depositPdcAction,
} from "@/modules/banking/pdc-actions";

interface PdcsClientProps {
  businessId: string;
  currency: string;
  initialPdcs: PdcRecord[];
  summary: PdcMaturitySummary;
  bankAccounts: { id: string; name: string; currencyCode: string }[];
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}

const PDC_COLUMN_LABELS: Record<string, string> = {
  direction: "Type",
  chequeNumber: "Cheque #",
  party: "Party",
  bankAccountName: "Clearing Account",
  maturityDate: "Maturity",
  amountMinor: "Amount",
  status: "Status",
};

export function PdcsClient({
  businessId,
  currency,
  initialPdcs,
  summary,
  bankAccounts,
  customers,
  suppliers,
}: PdcsClientProps) {
  const router = useRouter();
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [direction, setDirection] = useState<"receivable" | "payable">("receivable");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeBankName, setChequeBankName] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [maturityDate, setMaturityDate] = useState(today);
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [bounceTarget, setBounceTarget] = useState<PdcRecord | null>(null);
  const [bounceReason, setBounceReason] = useState("");

  const initialColumns = useMemo(
    () => ({
      direction: true,
      chequeNumber: true,
      party: true,
      bankAccountName: true,
      maturityDate: true,
      amountMinor: true,
      status: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "banking-pdcs",
    businessId,
    initial: initialColumns,
    labels: PDC_COLUMN_LABELS,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialPdcs.filter((pdc) => {
      if (directionFilter && pdc.direction !== directionFilter) return false;
      if (statusFilter && pdc.status !== statusFilter) return false;
      if (fromDate && pdc.maturityDate < fromDate) return false;
      if (toDate && pdc.maturityDate > toDate) return false;
      if (!q) return true;
      return (
        pdc.pdcNumber.toLowerCase().includes(q) ||
        pdc.chequeNumber.toLowerCase().includes(q) ||
        (pdc.customerName?.toLowerCase().includes(q) ?? false) ||
        (pdc.supplierName?.toLowerCase().includes(q) ?? false) ||
        (pdc.chequeBankName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [initialPdcs, query, directionFilter, statusFilter, fromDate, toDate]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    const result = await createPdcAction(businessId, {
      direction,
      chequeNumber,
      chequeBankName,
      issueDate,
      maturityDate,
      customerId,
      supplierId,
      bankAccountId,
      amount,
      reference,
      notes,
    });
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    toast.success("Post-dated cheque registered.");
    setCreateOpen(false);
    setChequeNumber("");
    setAmount("");
    setReference("");
    setNotes("");
    router.refresh();
  }

  const handleDeposit = useCallback(async (pdc: PdcRecord) => {
    const res = await depositPdcAction(businessId, pdc.id);
    if (res.error) return toast.error(res.error);
    toast.success(`${pdc.pdcNumber} marked as deposited at bank.`);
    router.refresh();
  }, [businessId, router]);

  const handleClear = useCallback(async (pdc: PdcRecord) => {
    const res = await clearPdcAction(businessId, pdc.id);
    if (res.error) return toast.error(res.error);
    toast.success(`${pdc.pdcNumber} cleared and posted to bank GL.`);
    router.refresh();
  }, [businessId, router]);

  const handleCancel = useCallback(async (pdc: PdcRecord) => {
    const res = await cancelPdcAction(businessId, pdc.id);
    if (res.error) return toast.error(res.error);
    toast.success(`${pdc.pdcNumber} cancelled and reversed.`);
    router.refresh();
  }, [businessId, router]);

  async function handleConfirmBounce(e: React.FormEvent) {
    e.preventDefault();
    if (!bounceTarget) return;
    setSubmitting(true);
    const res = await bouncePdcAction(businessId, bounceTarget.id, bounceReason);
    setSubmitting(false);
    if (res.error) return toast.error(res.error);
    toast.success(`${bounceTarget.pdcNumber} recorded as bounced.`);
    setBounceTarget(null);
    setBounceReason("");
    router.refresh();
  }

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "pdcNumber",
        header: "PDC #",
        meta: { className: "font-mono text-xs font-semibold" },
      },
      {
        accessorKey: "direction",
        header: "Type",
        cell: ({ row }: { row: { original: PdcRecord } }) => (
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            {row.original.direction === "receivable" ? (
              <>
                <ArrowDownLeft className="size-3.5 text-success" /> Receivable
              </>
            ) : (
              <>
                <ArrowUpRight className="size-3.5 text-warning-foreground" /> Payable
              </>
            )}
          </span>
        ),
      },
      {
        accessorKey: "chequeNumber",
        header: "Cheque # / Issuing Bank",
        cell: ({ row }: { row: { original: PdcRecord } }) => (
          <div>
            <div className="font-medium">{row.original.chequeNumber}</div>
            {row.original.chequeBankName && (
              <div className="text-xs text-muted-foreground">{row.original.chequeBankName}</div>
            )}
          </div>
        ),
      },
      {
        id: "party",
        header: "Party",
        accessorFn: (r: PdcRecord) => r.customerName || r.supplierName || "—",
      },
      {
        accessorKey: "bankAccountName",
        header: "Clearing Account",
        meta: { className: "text-xs text-muted-foreground" },
      },
      {
        accessorKey: "maturityDate",
        header: "Maturity",
        cell: ({ row }: { row: { original: PdcRecord } }) => {
          const pdc = row.original;
          const isOverdue = (pdc.status === "held" || pdc.status === "deposited") && pdc.maturityDate < today;
          return (
            <div>
              <div className={isOverdue ? "font-medium text-danger" : ""}>{formatDate(pdc.maturityDate)}</div>
              {isOverdue && <span className="text-[11px] text-danger">Matured / Overdue</span>}
            </div>
          );
        },
      },
      {
        accessorKey: "amountMinor",
        header: "Amount",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: PdcRecord } }) => (
          <span className="money font-medium">{formatMoney(row.original.amountMinor, row.original.currencyCode)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: PdcRecord } }) => {
          const pdc = row.original;
          return (
            <div>
              <StatusBadge status={pdc.status} />
              {pdc.bounceReason && (
                <div className="mt-1 text-[11px] text-danger max-w-[180px] truncate" title={pdc.bounceReason}>
                  {pdc.bounceReason}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="block text-right">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "text-right" },
        cell: ({ row }: { row: { original: PdcRecord } }) => {
          const pdc = row.original;
          return (
            <div className="inline-flex items-center gap-1.5">
              {pdc.status === "held" && (
                <Button permission="edit" size="sm" variant="secondary" onClick={() => handleDeposit(pdc)} title="Mark cheque deposited at bank">
                  <Send className="size-3.5" /> Deposit
                </Button>
              )}
              {(pdc.status === "held" || pdc.status === "deposited") && (
                <>
                  <Button permission="approve" size="sm" onClick={() => handleClear(pdc)} title="Clear cheque to bank ledger">
                    <CheckCircle2 className="size-3.5" /> Clear
                  </Button>
                  <Button
                    permission="approve"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setBounceTarget(pdc);
                      setBounceReason("");
                    }}
                    title="Record cheque bounced"
                  >
                    <AlertTriangle className="size-3.5 text-danger" /> Bounce
                  </Button>
                </>
              )}
              {pdc.status === "held" && (
                <Button permission="edit" size="sm" variant="ghost" onClick={() => handleCancel(pdc)} title="Cancel held cheque">
                  <Ban className="size-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [handleCancel, handleClear, handleDeposit, today],
  );

  const { pagination, onPaginationChange, paginationInfo, setPage, setPageSize } = useTablePagination(filtered.length);

  const table = useTable({
    data: filtered,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange: setSorting,
    onPaginationChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = () => {
    setQuery("");
    setDirectionFilter("");
    setStatusFilter("");
    setFromDate("");
    setToDate("");
  };
  const hasActiveFilter = Boolean(query || directionFilter || statusFilter || fromDate || toDate);

  const totalPdcMinor = useMemo(
    () => filtered.filter((p) => p.status !== "cancelled").reduce((sum, p) => sum + p.amountMinor, 0),
    [filtered],
  );

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Post-Dated Cheques (PDC)"
        description="Track held, deposited, cleared, and bounced customer & supplier cheques with automated clearing account entries."
      >
        <Button permission="create" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Register PDC
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="text-xs text-muted-foreground">Held Receivable PDCs</p>
          <p className="money mt-1 text-lg font-semibold text-foreground">
            {formatMoney(summary.heldReceivableMinor, currency)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Asset clearing (1120)</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="text-xs text-muted-foreground">Held Payable PDCs</p>
          <p className="money mt-1 text-lg font-semibold text-foreground">
            {formatMoney(summary.heldPayableMinor, currency)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Liability clearing (2020)</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="text-xs text-muted-foreground">Maturing Within 30 Days</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{summary.dueSoonCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rec: {formatMoney(summary.dueSoonReceivableMinor, currency)} · Pay:{" "}
            {formatMoney(summary.dueSoonPayableMinor, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="text-xs text-muted-foreground">Overdue / Bounced Attention</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-danger">
            {summary.overdueCount} overdue · {summary.bouncedCount} bounced
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Overdue Rec: {formatMoney(summary.overdueReceivableMinor, currency)}
          </p>
        </div>
      </div>

      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search PDC #, cheque #, party, bank..."
          ariaLabel="Search PDCs"
        />
        <ToolbarSelect
          value={directionFilter}
          onChange={setDirectionFilter}
          ariaLabel="Filter by direction"
          options={[
            { value: "", label: "All directions" },
            { value: "receivable", label: "Receivable (Customer)" },
            { value: "payable", label: "Payable (Supplier)" },
          ]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          fromAriaLabel="Maturity date from"
          toAriaLabel="Maturity date to"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "held", label: "Held" },
            { value: "deposited", label: "Deposited" },
            { value: "cleared", label: "Cleared" },
            { value: "bounced", label: "Bounced" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
          {directionFilter && (
            <FilterChip onRemove={() => setDirectionFilter("")}>
              Direction: {directionFilter === "receivable" ? "Receivable" : "Payable"}
            </FilterChip>
          )}
          {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {fromDate}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setToDate("")}>To: {toDate}</FilterChip>}
          {statusFilter && (
            <FilterChip onRemove={() => setStatusFilter("")}>
              Status: {statusLabel(statusFilter)}
            </FilterChip>
          )}
        </ActiveFiltersRow>
      )}

      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[980px]"
          noResultsMessage={initialPdcs.length === 0 ? "No post-dated cheques recorded yet." : "No post-dated cheques match"}
          noResultsSubtext={initialPdcs.length === 0 ? "Register a cheque to start tracking maturity and clearing." : "Try adjusting your search or filter criteria."}
          onClearFilters={hasActiveFilter ? clearFilters : undefined}
        />
        {filtered.length > 0 && (
          <TableTotalsBar
            filteredCount={filtered.length}
            totalCount={initialPdcs.length}
            itemLabel="cheques"
            metrics={[
              {
                label: "Total Active Face Value",
                value: formatMoney(totalPdcMinor, currency),
                tone: "primary",
              },
            ]}
          />
        )}
        <ClientListPagination
          info={paginationInfo}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ListTableCard>

      <DialogRoot open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="size-4 text-primary" /> Register Post-Dated Cheque
          </DialogTitle>
          <DialogDescription>
            Creates a PDC entry in Held status and posts to the PDC Receivable (1120) or PDC Payable (2020) clearing account.
          </DialogDescription>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pdc-direction">Direction</Label>
                <SelectNative
                  id="pdc-direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "receivable" | "payable")}
                >
                  <option value="receivable">Receivable (From Customer)</option>
                  <option value="payable">Payable (To Supplier)</option>
                </SelectNative>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdc-bank-account">Designated Clearing Bank</Label>
                <SelectNative
                  id="pdc-bank-account"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                >
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currencyCode})
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdc-party">
                  {direction === "receivable" ? "Customer" : "Supplier"}
                </Label>
                {direction === "receivable" ? (
                  <SelectNative
                    id="pdc-party"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Select customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectNative>
                ) : (
                  <SelectNative
                    id="pdc-party"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">Select supplier…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectNative>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdc-amount">Amount</Label>
                <Input
                  id="pdc-amount"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdc-cheque-no">Cheque Number</Label>
                <Input
                  id="pdc-cheque-no"
                  placeholder="e.g. CHQ-009481"
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdc-issuing-bank">Issuing Bank Name</Label>
                <Input
                  id="pdc-issuing-bank"
                  placeholder="e.g. Emirates NBD"
                  value={chequeBankName}
                  onChange={(e) => setChequeBankName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdc-issue-date">Issue Date</Label>
                <Input
                  id="pdc-issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdc-maturity-date">Maturity Date</Label>
                <Input
                  id="pdc-maturity-date"
                  type="date"
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdc-notes">Notes / Memo</Label>
              <Input
                id="pdc-notes"
                placeholder="Optional memo or contract reference"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {formError && <FormError message={formError} />}
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button permission="create" type="submit" disabled={submitting}>
                {submitting ? "Registering…" : "Register PDC"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={Boolean(bounceTarget)} onOpenChange={(o) => !o && setBounceTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Record Bounced Cheque</DialogTitle>
          <DialogDescription>
            Reverses the PDC clearing entry for {bounceTarget?.pdcNumber} ({bounceTarget?.chequeNumber}) back to the party&apos;s balance.
          </DialogDescription>
          <form onSubmit={handleConfirmBounce} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bounce-reason">Bank Return / Bounce Reason</Label>
              <Input
                id="bounce-reason"
                placeholder="e.g. Insufficient funds / Signature mismatch"
                value={bounceReason}
                onChange={(e) => setBounceReason(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="secondary" onClick={() => setBounceTarget(null)}>
                Cancel
              </Button>
              <Button permission="approve" type="submit" variant="danger" disabled={submitting}>
                {submitting ? "Recording…" : "Confirm Bounce"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
