import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "./project-input";

const labels: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const tones: Record<ProjectStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  active: "info",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={tones[status]}>{labels[status]}</Badge>;
}

export function projectStatusLabel(status: ProjectStatus) { return labels[status]; }
