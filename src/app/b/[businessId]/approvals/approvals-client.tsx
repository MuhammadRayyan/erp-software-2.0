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
import { type SortingState } from "@tanstack/react-table";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { ClientListPagination, useTablePagination } from "@/components/list-pagination";
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
import { formatDateTime, formatMoney } from "@/core/format";
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequestRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");

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
    const res = await approveDocumentRequestAction(businessId, req.id);
    setActingId(null);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success(`Approved ${req.entityLabel} ${req.entityNumber}. Submitter notified.`);
    router.refresh();
  }, [businessId, router]);

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    setActingId(rejectTarget.id);
    const res = await rejectDocumentRequestAction(businessId, rejectTarget.id, rejectNote);
    setActingId(null);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success(`Returned ${rejectTarget.entityNumber} to draft. Submitter notified.`);
    setRejectTarget(null);
    setRejectNote("");
    router.refresh();
  }

  const handleWithdraw = useCallback(async (req: ApprovalRequestRecord) => {
    setActingId(req.id);
    const res = await withdrawApprovalRequestAction(businessId, req.id, req.entityUrl);
    setActingId(null);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success(`Withdrew ${req.entityNumber} back to draft.`);
    router.refresh();
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
            return (
              <Link href={req.entityUrl} className="text-xs font-medium text-primary hover:underline">
                Open Document
              </Link>
            );
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

  const { pagination, onPaginationChange, paginationInfo, setPage, setPageSize } = useTablePagination(visible.length);

  const table = useTable({
    data: visible,
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
    setStatusFilter("pending");
  };
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
          onChange={setQuery}
          placeholder="Search document #, type, or submitter…"
          ariaLabel="Search approval requests"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={setStatusFilter}
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
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {statusFilter !== "pending" && (
            <FilterChip onRemove={() => setStatusFilter("pending")}>Status: {statusFilter}</FilterChip>
          )}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[920px]"
          noResultsMessage="No approval requests match"
          noResultsSubtext="Adjust your search or status filter."
          onClearFilters={clearFilters}
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

      <DialogRoot open={Boolean(rejectTarget)} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Reject &amp; Return to Draft</DialogTitle>
          <DialogDescription>
            Returns {rejectTarget?.entityLabel} {rejectTarget?.entityNumber} to Draft status and sends your feedback back to {rejectTarget?.requestedByName}.
          </DialogDescription>
          <form onSubmit={handleRejectSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Rejection Reason / Feedback</Label>
              <Input
                id="reject-reason"
                placeholder="e.g. Attach supplier quote or verify cost center"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="secondary" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={Boolean(actingId)}>
                Reject to Draft
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
