"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
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
  const [actionError, setActionError] = useState("");
  const [rejectError, setRejectError] = useState("");

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
    setActionError("");
    try {
      const res = await approveDocumentRequestAction(businessId, approval!.id);
      if (res.error) {
        setActionError(res.error);
        return toast.error(res.error);
      }
      broadcastLiveRefresh();
      toast.success("Approved and finalized. Submitter notified.");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve request.";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onReject(e: React.FormEvent) {
    e.preventDefault();
    setRejectError("");
    if (!rejectNote.trim()) {
      setRejectError("Please provide a reason for returning this document to draft.");
      return;
    }
    setBusy(true);
    try {
      const res = await rejectDocumentRequestAction(businessId, approval!.id, rejectNote.trim());
      if (res.error) {
        setRejectError(res.error);
        return toast.error(res.error);
      }
      broadcastLiveRefresh();
      toast.success("Returned to draft. Submitter notified.");
      setShowReject(false);
      setRejectNote("");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject request.";
      setRejectError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    setActionError("");
    try {
      const res = await withdrawApprovalRequestAction(
        businessId,
        approval!.id,
        approval!.entityUrl,
      );
      if (res.error) {
        setActionError(res.error);
        return toast.error(res.error);
      }
      broadcastLiveRefresh();
      toast.success("Withdrawn back to draft.");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to withdraw request.";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
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

      {actionError && <FormError message={actionError} />}

      {showReject && (
        <form onSubmit={onReject} className="flex flex-wrap items-center gap-2 pt-2 border-t border-warning/25" noValidate>
          <Input
            className="flex-1 min-w-55"
            placeholder="Reason for returning to draft…"
            value={rejectNote}
            onChange={(e) => {
              setRejectNote(e.target.value);
              if (rejectError) setRejectError("");
            }}
            required
            aria-invalid={!!rejectError}
          />
          <Button size="sm" type="submit" variant="danger" disabled={busy}>
            Confirm Rejection
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => {
              setShowReject(false);
              setRejectError("");
            }}
          >
            Cancel
          </Button>
          {rejectError && (
            <div className="basis-full">
              <FormError message={rejectError} />
            </div>
          )}
        </form>
      )}
    </div>
  );
}
