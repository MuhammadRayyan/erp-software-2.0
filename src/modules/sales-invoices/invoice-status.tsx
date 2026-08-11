import { Badge } from "@/components/ui/badge";
import type { DocumentStatus, PaymentStatus } from "./invoice-service";

const documentStyles = {
  draft: { tone: "neutral", label: "Draft" },
  posted: { tone: "info", label: "Posted" },
  void: { tone: "danger", label: "Void" },
} as const;

const paymentStyles = {
  unpaid: { tone: "warning", label: "Unpaid" },
  partially_paid: { tone: "warning", label: "Partially Paid" },
  paid: { tone: "success", label: "Paid" },
  overdue: { tone: "danger", label: "Overdue" },
} as const;

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const style = documentStyles[status];
  return <Badge tone={style.tone}>{style.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const style = paymentStyles[status];
  return <Badge tone={style.tone}>{style.label}</Badge>;
}
