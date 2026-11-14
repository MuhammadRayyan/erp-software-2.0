"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/core/format";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import type { ApprovalRequestRecord } from "@/modules/approvals/approval-service";
import {
  approveDocumentRequestAction,
  rejectDocumentRequestAction,
  withdrawApprovalRequestAction,
} from "@/modules/approvals/approval-actions";

export function DocumentApprovalBanner({
  businessId,
  currentUserId,
  isAdmin,
  approval,
}: {
  businessId: string;
  currentUserId: string;
  isAdmin: boolean;
  approval: ApprovalRequestRecord | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  if (!approval) return null;

  if (approval.status === "rejected") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-danger">
          <XCircle className="size-4" />
          Returned to Draft by {approval.decidedByName || "Approver"}
        </div>
        {approval.decisionNote && (
          <p className="mt-1 text-xs text-foreground">Reason: {approval.decisionNote}</p>
        )}
      </div>
    );
  }

  if (approval.status !== "pending") return null;

  async function onApprove() {
    setBusy(true);
    const res = await approveDocumentRequestAction(businessId, approval!.id);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success("Approved and finalized. Submitter notified.");
    router.refresh();
  }

  async function onReject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await rejectDocumentRequestAction(businessId, approval!.id, rejectNote);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success("Returned to draft. Submitter notified.");
    setShowReject(false);
    setRejectNote("");
    router.refresh();
  }

  async function onWithdraw() {
    setBusy(true);
    const res = await withdrawApprovalRequestAction(
      businessId,
      approval!.id,
      approval!.entityUrl,
    );
    setBusy(false);
    if (res.error) return toast.error(res.error);
    broadcastLiveRefresh();
    toast.success("Withdrawn back to draft.");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="size-4 text-warning" />
            Pending Maker-Checker Approval
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted by <strong>{approval.requestedByName}</strong> on{" "}
            {formatDateTime(approval.requestedAt)}. Ledger posting is deferred until approved.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {approval.canApprove ? (
            <>
              <Button size="sm" disabled={busy} onClick={onApprove}>
                <CheckCircle2 className="size-4" /> Approve &amp; Finalize
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setShowReject((v) => !v)}
              >
                <XCircle className="size-4 text-danger" /> Reject to Draft
              </Button>
            </>
          ) : (
            approval.blockedReason && (
              <span className="text-xs text-muted-foreground">{approval.blockedReason}</span>
            )
          )}
          {(approval.requestedBy === currentUserId || isAdmin) && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onWithdraw}>
              <RotateCcw className="size-3.5" /> Withdraw to Draft
            </Button>
          )}
        </div>
      </div>

      {showReject && (
        <form onSubmit={onReject} className="flex flex-wrap items-center gap-2 pt-2 border-t border-warning/25">
          <Input
            className="flex-1 min-w-[220px]"
            placeholder="Reason for returning to draft…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            required
          />
          <Button size="sm" type="submit" variant="danger" disabled={busy}>
            Confirm Rejection
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => setShowReject(false)}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
