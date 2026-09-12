import { Badge } from "@/components/ui/badge";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Shared tone map for document and payment statuses across the app. */
const STATUS_TONES: Record<string, StatusTone> = {
  draft: "neutral",
  posted: "info",
  sent: "info",
  open: "info",
  issued: "info",
  unpaid: "warning",
  partially_paid: "warning",
  partial: "warning",
  paid: "success",
  settled: "success",
  completed: "success",
  closed: "success",
  active: "success",
  accepted: "success",
  void: "danger",
  cancelled: "danger",
  rejected: "danger",
  overdue: "danger",
  superseded: "neutral",
  inactive: "neutral",
};

const LABELS: Record<string, string> = {
  draft: "Draft",
  posted: "Posted",
  sent: "Sent",
  open: "Open",
  issued: "Issued",
  unpaid: "Unpaid",
  partially_paid: "Partially Paid",
  partial: "Partial",
  paid: "Paid",
  settled: "Settled",
  completed: "Completed",
  closed: "Closed",
  active: "Active",
  accepted: "Accepted",
  void: "Void",
  cancelled: "Cancelled",
  rejected: "Rejected",
  superseded: "Superseded",
  overdue: "Overdue",
  inactive: "Inactive",
};

/** Human-readable label for a status slug, falling back to the raw value. */
export function statusLabel(status: string): string {
  return LABELS[status] ?? status;
}

/** Single source of truth for document/payment status badges. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{statusLabel(status)}</Badge>;
}
