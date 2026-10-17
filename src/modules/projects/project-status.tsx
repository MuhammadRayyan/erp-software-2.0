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

import type { ProjectCustomerRole } from "./project-input";

export const customerRoleLabels: Record<ProjectCustomerRole, string> = {
  primary_client: "Primary Client",
  co_client: "Co-Client",
  joint_venture: "Joint Venture Partner",
  tenant: "Tenant / Fit-Out",
  bill_to: "Bill-To Party",
  sponsor: "Project Sponsor",
  consultant: "Consultant / Rep",
};

export const customerRoleTones: Record<ProjectCustomerRole, "neutral" | "info" | "warning" | "success" | "danger"> = {
  primary_client: "info",
  co_client: "neutral",
  joint_venture: "warning",
  tenant: "neutral",
  bill_to: "info",
  sponsor: "success",
  consultant: "neutral",
};

export function ProjectCustomerRoleBadge({ role }: { role: ProjectCustomerRole }) {
  return <Badge tone={customerRoleTones[role] ?? "neutral"}>{customerRoleLabels[role] ?? role}</Badge>;
}

export function projectCustomerRoleLabel(role: ProjectCustomerRole) {
  return customerRoleLabels[role] ?? role;
}
