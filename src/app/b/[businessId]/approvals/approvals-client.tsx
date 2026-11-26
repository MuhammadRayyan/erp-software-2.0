"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw, Settings, ShieldCheck, XCircle } from "lucide-react";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useTableDensity } from "@/components/use-table-density";
import { ClientListPagination } from "@/components/list-pagination";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActiveFiltersRow, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { FormError } from "@/components/form-error";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { formatDateTime, formatMoney, minorToDecimalString } from "@/core/format";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import type { ApprovalRequestRecord } from "@/modules/approvals/approval-service";
import {
  approveDocumentRequestAction,
  rejectDocumentRequestAction,
  withdrawApprovalRequestAction,
} from "@/modules/approvals/approval-actions";

const APPROVAL_COLUMN_LABELS: Record<string, string> = {
  entityLabel: "Type",
  requestedByName: "Submitted By",
  requestedAt: "Submitted At",
  amountMinor: "Amount",
  status: "Status",
};

export function ApprovalsClient({
  businessId,
  currentUserId,
  isAdmin,
  requests,
}: {
  businessId: string;
  currentUserId: string;
  isAdmin: boolean;
  requests: ApprovalRequestRecord[];
}) {
  const router = useRouter();
  const { density } = useTableDensity(businessId);
  const {
    query,
    status: rawStatus,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState();
  const statusFilter = rawStatus || "pending";
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequestRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState("");

  const initialColumns = useMemo(
    () => ({
      entityLabel: true,
      requestedByName: true,
      requestedAt: true,
      amountMinor: true,
      status: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "approval-queue",
    businessId,
    initial: initialColumns,
    labels: APPROVAL_COLUMN_LABELS,
  });

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests],
  );
  const actionableCount = useMemo(
    () => requests.filter((r) => r.status === "pending" && r.canApprove).length,
    [requests],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return `${r.entityNumber} ${r.entityLabel} ${r.requestedByName}`.toLowerCase().includes(q);
    });
  }, [requests, statusFilter, query]);

  const handleApprove = useCallback(async (req: ApprovalRequestRecord) => {
    setActingId(req.id);
    try {
      const res = await approveDocumentRequestAction(businessId, req.id);
      if (res.error) return toast.error(res.error);
      broadcastLiveRefresh();
      toast.success(`Approved ${req.entityLabel} ${req.entityNumber}. Submitter notified.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve request.");
    } finally {
      setActingId(null);
    }
  }, [businessId, router]);

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      setRejectError("Please provide a reason for returning this document to draft.");
      return;
    }
    setRejectError("");
    setActingId(rejectTarget.id);
    try {
      const res = await rejectDocumentRequestAction(businessId, rejectTarget.id, rejectNote.trim());
      if (res.error) {
        setRejectError(res.error);
        return;
      }
      broadcastLiveRefresh();
      toast.success(`Returned ${rejectTarget.entityNumber} to draft. Submitter notified.`);
      setRejectTarget(null);
      setRejectNote("");
      router.refresh();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : "Failed to reject request.");
    } finally {
      setActingId(null);
    }
  }

  const handleWithdraw = useCallback(async (req: ApprovalRequestRecord) => {
    setActingId(req.id);
    try {
      const res = await withdrawApprovalRequestAction(businessId, req.id, req.entityUrl);
      if (res.error) return toast.error(res.error);
      broadcastLiveRefresh();
      toast.success(`Withdrew ${req.entityNumber} back to draft.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to withdraw request.");
    } finally {
      setActingId(null);
    }
  }, [businessId, router]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "entityNumber",
        header: "Document",
        cell: ({ row }: { row: { original: ApprovalRequestRecord } }) => (
          <Link href={row.original.entityUrl} className="font-mono text-xs font-semibold text-primary hover:underline">
            {row.original.entityNumber}
          </Link>
        ),
      },
      { accessorKey: "entityLabel", header: "Type" },
      { accessorKey: "requestedByName", header: "Submitted By" },
      {
        accessorKey: "requestedAt",
        header: "Submitted At",
        meta: { className: "text-xs text-muted-foreground" },
        cell: ({ row }: { row: { original: ApprovalRequestRecord } }) => formatDateTime(row.original.requestedAt),
      },
      {
        accessorKey: "amountMinor",
        header: "Amount",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: ApprovalRequestRecord } }) => (
          <span className="money font-medium">{formatMoney(row.original.amountMinor, row.original.currencyCode)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: ApprovalRequestRecord } }) => {
          const req = row.original;
          return (
            <div>
              {req.status === "pending" && (
                <Badge tone="warning" className="gap-1">
                  <Clock className="size-3" /> Pending Approval
                </Badge>
              )}
              {req.status === "approved" && (
                <Badge tone="success" className="gap-1">
                  <ShieldCheck className="size-3" /> Approved
                </Badge>
              )}
              {req.status === "rejected" && (
                <Badge tone="danger" className="gap-1">
                  <XCircle className="size-3" /> Rejected
                </Badge>
              )}
              {req.status === "withdrawn" && <Badge tone="neutral">Withdrawn</Badge>}
              {req.decidedByName && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  By {req.decidedByName}
                  {req.decisionNote ? ` · "${req.decisionNote}"` : ""}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "decision",
        header: () => <span className="block text-right">Decision</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "text-right" },
        cell: ({ row }: { row: { original: ApprovalRequestRecord } }) => {
          const req = row.original;
          if (req.status !== "pending") {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div className="inline-flex items-center gap-1.5">
              {req.canApprove ? (
                <>
                  <Button size="sm" disabled={actingId === req.id} onClick={() => handleApprove(req)}>
                    <CheckCircle2 className="size-3.5" /> Approve &amp; Post
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actingId === req.id}
                    onClick={() => {
                      setRejectError("");
                      setRejectTarget(req);
                      setRejectNote("");
                    }}
                  >
                    <XCircle className="size-3.5 text-danger" /> Reject
                  </Button>
                </>
              ) : (
                req.blockedReason && (
                  <span className="text-[11px] text-muted-foreground mr-2">{req.blockedReason}</span>
                )
              )}
              {(req.requestedBy === currentUserId || isAdmin) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actingId === req.id}
                  onClick={() => handleWithdraw(req)}
                  title="Withdraw back to draft"
                >
                  <RotateCcw className="size-3.5" /> Withdraw
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [actingId, currentUserId, handleApprove, handleWithdraw, isAdmin],
  );

  const { pagination, paginationInfo } = buildPagination(visible.length);

  const table = useTable({
    data: visible,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = resetFilters;
  const hasActiveFilter = Boolean(query || statusFilter !== "pending");

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Approval Queue"
        description="Maker-Checker review queue for documents awaiting authorization before ledger posting or issuance."
      >
        {isAdmin && (
          <Button asChild variant="secondary">
            <Link href={`/b/${businessId}/settings/approvals`}>
              <Settings className="size-4" /> Approval Rules & Thresholds
            </Link>
          </Button>
        )}
      </PageHeader>

      {requests.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="mx-auto mb-3 size-8 text-muted-foreground/60" />}
          title="No approval requests yet"
          description="When Maker-Checker approval rules are enabled, submitted documents awaiting review will appear here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <p className="text-xs text-muted-foreground">Pending Requests</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{pendingCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <p className="text-xs text-muted-foreground">Ready for Your Decision</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-primary">{actionableCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <p className="text-xs text-muted-foreground">Processed History</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {requests.length - pendingCount}
              </p>
            </div>
          </div>

          <ListToolbar>
            <SearchInput
              value={query}
              onChange={(v) => setFilter("q", v)}
              placeholder="Search document #, type, or submitter…"
              ariaLabel="Search approval requests"
            />
            <ToolbarSelect
              value={statusFilter}
              onChange={(v) => setFilter("status", v)}
              ariaLabel="Filter approval requests"
              options={[
                { value: "pending", label: "Pending Approval" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "withdrawn", label: "Withdrawn" },
                { value: "all", label: "All History" },
              ]}
            />
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <ExportCsvButton
                size="sm"
                permissionModule={["sales", "purchases", "accounting", "banking", "inventory", "payroll", "projects"]}
                filename="approval-requests"
                data={visible}
                columns={[
                  { header: "Document #", accessorKey: "entityNumber" },
                  { header: "Type", accessorKey: "entityLabel" },
                  { header: "Submitted By", accessorKey: "requestedByName" },
                  { header: "Submitted At", accessorKey: "requestedAt" },
                  { header: "Amount", accessorFn: (r) => minorToDecimalString(r.amountMinor, r.currencyCode) },
                  { header: "Currency", accessorKey: "currencyCode" },
                  { header: "Status", accessorKey: "status" },
                ]}
              />
              <DensityToggle businessId={businessId} />
              {dropdown}
            </div>
          </ListToolbar>
          {hasActiveFilter && (
            <ActiveFiltersRow onClearAll={clearFilters}>
              {statusFilter !== "pending" && (
                <FilterChip onRemove={() => setFilter("status", "")}>Status: {statusFilter}</FilterChip>
              )}
              {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
            </ActiveFiltersRow>
          )}

          <ListTableCard>
            <DataTable
              table={table}
              density={density}
              framed={false}
              minWidth="min-w-table-xl"
              getRowHref={(row) => row.entityUrl}
              noResultsMessage={hasActiveFilter ? "No approval requests match" : "No pending approval requests"}
              noResultsSubtext={
                hasActiveFilter
                  ? "Adjust your search or status filter."
                  : "Historical processed requests can be viewed under All History."
              }
              onClearFilters={() => {
                if (hasActiveFilter) {
                  clearFilters();
                } else {
                  setFilter("status", "all");
                }
              }}
            />
            {visible.length > 0 && (
              <TableTotalsBar
                filteredCount={visible.length}
                totalCount={requests.length}
                itemLabel="requests"
              />
            )}
            <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </ListTableCard>
        </>
      )}

      <DialogRoot
        open={Boolean(rejectTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectError("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>Reject &amp; Return to Draft</DialogTitle>
          <DialogDescription>
            Returns {rejectTarget?.entityLabel} {rejectTarget?.entityNumber} to Draft status and sends your feedback back to {rejectTarget?.requestedByName}.
          </DialogDescription>
          <form onSubmit={handleRejectSubmit} className="mt-4 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Rejection Reason / Feedback</Label>
              <Input
                id="reject-reason"
                placeholder="e.g. Attach supplier quote or verify cost center"
                value={rejectNote}
                onChange={(e) => {
                  setRejectNote(e.target.value);
                  if (rejectError) setRejectError("");
                }}
                aria-invalid={!!rejectError}
                required
              />
            </div>
            {rejectError && <FormError message={rejectError} />}
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                disabled={actingId === rejectTarget?.id}
                onClick={() => {
                  setRejectTarget(null);
                  setRejectError("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={actingId === rejectTarget?.id}>
                Reject to Draft
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
