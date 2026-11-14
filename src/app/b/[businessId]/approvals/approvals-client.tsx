"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw, Settings, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToolbarSelect } from "@/components/list-toolbar";
import { formatDateTime, formatMoney } from "@/core/format";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import type { ApprovalRequestRecord } from "@/modules/approvals/approval-service";
import {
  approveDocumentRequestAction,
  rejectDocumentRequestAction,
  withdrawApprovalRequestAction,
} from "@/modules/approvals/approval-actions";

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
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequestRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests],
  );
  const actionableCount = useMemo(
    () => requests.filter((r) => r.status === "pending" && r.canApprove).length,
    [requests],
  );

  const visible = useMemo(
    () =>
      requests.filter((r) => statusFilter === "all" || r.status === statusFilter),
    [requests, statusFilter],
  );

  async function handleApprove(req: ApprovalRequestRecord) {
    setActingId(req.id);
    const res = await approveDocumentRequestAction(businessId, req.id);
    setActingId(null);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success(`Approved ${req.entityLabel} ${req.entityNumber}. Submitter notified.`);
    router.refresh();
  }

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

  async function handleWithdraw(req: ApprovalRequestRecord) {
    setActingId(req.id);
    const res = await withdrawApprovalRequestAction(businessId, req.id, req.entityUrl);
    setActingId(null);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success(`Withdrew ${req.entityNumber} back to draft.`);
    router.refresh();
  }

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

      <div className="flex items-center justify-between gap-3">
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
      </div>

      <div className="data-panel overflow-x-auto">
        <table className="data-table min-w-[920px]">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th>Submitted By</th>
              <th>Submitted At</th>
              <th className="text-right!">Amount</th>
              <th>Status</th>
              <th className="text-right!">Decision</th>
            </tr>
          </thead>
          <tbody>
            {visible.length > 0 ? (
              visible.map((req) => (
                <tr key={req.id}>
                  <td>
                    <Link
                      href={req.entityUrl}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {req.entityNumber}
                    </Link>
                  </td>
                  <td>{req.entityLabel}</td>
                  <td>{req.requestedByName}</td>
                  <td className="text-xs text-muted-foreground">
                    {formatDateTime(req.requestedAt)}
                  </td>
                  <td className="money text-right font-medium">
                    {formatMoney(req.amountMinor, req.currencyCode)}
                  </td>
                  <td>
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
                  </td>
                  <td className="text-right">
                    {req.status === "pending" ? (
                      <div className="inline-flex items-center gap-1.5">
                        {req.canApprove ? (
                          <>
                            <Button
                              size="sm"
                              disabled={actingId === req.id}
                              onClick={() => handleApprove(req)}
                            >
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
                            <span className="text-[11px] text-muted-foreground mr-2">
                              {req.blockedReason}
                            </span>
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
                    ) : (
                      <Link
                        href={req.entityUrl}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open Document
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">
                  No approval requests in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
