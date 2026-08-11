import { Badge } from "@/components/ui/badge";
import type { EInvoiceStatus } from "./einvoice-types";

const styles = {
  NotPrepared: { tone: "neutral", label: "Not Prepared" },
  NeedsData: { tone: "warning", label: "Needs Data" },
  ValidationFailed: { tone: "danger", label: "Validation Failed" },
  Ready: { tone: "info", label: "Ready" },
  Submitted: { tone: "warning", label: "Submitted" },
  Accepted: { tone: "success", label: "Accepted" },
  Rejected: { tone: "danger", label: "Rejected" },
} as const;

export function EInvoiceStatusBadge({ status }: { status: EInvoiceStatus }) {
  const style = styles[status];
  return <Badge tone={style.tone}>{style.label}</Badge>;
}
