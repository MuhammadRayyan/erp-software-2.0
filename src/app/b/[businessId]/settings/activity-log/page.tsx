import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings-shell";
import { requireUser } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";
import {
  listActivityLogs,
  getActivityLogUsers,
  getActivityLogSettings,
  type ActivityLogFilters,
} from "@/modules/activity-log/activity-log-service";
import { ActivityLogClient } from "./activity-log-client";

export default async function ActivityLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) redirect("/businesses");

  const isAdmin = access.membership.role === "administrator";
  const sp = await searchParams;

  const filters: ActivityLogFilters = {
    userId: typeof sp.userId === "string" ? sp.userId : undefined,
    action: typeof sp.action === "string" ? sp.action : undefined,
    entityType: typeof sp.entityType === "string" ? sp.entityType : undefined,
    search: typeof sp.search === "string" ? sp.search : undefined,
    dateRange: (typeof sp.dateRange === "string" ? sp.dateRange : "all") as any,
    startDate: typeof sp.startDate === "string" ? sp.startDate : undefined,
    endDate: typeof sp.endDate === "string" ? sp.endDate : undefined,
  };

  const initialData = listActivityLogs(businessId, user.id, filters);
  const usersList = getActivityLogUsers(businessId, user.id);
  const initialRetentionSettings = isAdmin
    ? getActivityLogSettings(businessId, user.id)
    : null;

  return (
    <SettingsShell
      businessId={businessId}
      title={isAdmin ? "Activity & Audit Log" : "My Activity Log"}
      description={
        isAdmin
          ? "Inspect actions, transactions, postings, and audit trails across all workspace members."
          : "View your personal activity history, created documents, posted entries, and audit trail in this workspace."
      }
    >
      <ActivityLogClient
        businessId={businessId}
        initialData={initialData}
        usersList={usersList}
        initialRetentionSettings={initialRetentionSettings}
        currentUserId={user.id}
        isAdmin={isAdmin}
      />
    </SettingsShell>
  );
}
