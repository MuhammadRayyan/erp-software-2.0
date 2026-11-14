import { requireUser } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { notFound } from "next/navigation";
import { listApprovalRequests } from "@/modules/approvals/approval-service";
import { ApprovalsClient } from "./approvals-client";

export const metadata = {
  title: "Approval Queue",
};

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) notFound();

  const requests = listApprovalRequests(businessId, user.id);

  return (
    <ApprovalsClient
      businessId={businessId}
      currentUserId={user.id}
      isAdmin={access.membership.role === "administrator"}
      requests={requests}
    />
  );
}
