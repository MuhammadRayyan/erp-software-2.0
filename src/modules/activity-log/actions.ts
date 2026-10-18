"use server";

import { requireUser } from "@/core/auth/session";
import {
  listActivityLogs,
  getActivityLogUsers,
  type ActivityLogFilters,
  type ListActivityLogsResult,
} from "./activity-log-service";

export async function getActivityLogsAction(
  businessId: string,
  filters: ActivityLogFilters = {},
): Promise<ListActivityLogsResult> {
  const user = await requireUser();
  return listActivityLogs(businessId, user.id, filters);
}

export async function getActivityUsersAction(
  businessId: string,
): Promise<{ id: string; name: string; email: string; role: string }[]> {
  const user = await requireUser();
  return getActivityLogUsers(businessId, user.id);
}

export async function getActivityLogSettingsAction(businessId: string) {
  const user = await requireUser();
  const { getActivityLogSettings } = await import("./activity-log-service");
  return getActivityLogSettings(businessId, user.id);
}

export async function updateActivityLogSettingsAction(
  businessId: string,
  input: { retentionEnabled: boolean; retentionDays: number },
) {
  const user = await requireUser();
  const { updateActivityLogSettings } = await import("./activity-log-service");
  return updateActivityLogSettings(businessId, user.id, input);
}

export async function runActivityLogCleanupAction(
  businessId: string,
  overrideDays?: number,
) {
  const user = await requireUser();
  const { runActivityLogCleanup } = await import("./activity-log-service");
  return runActivityLogCleanup(businessId, user.id, overrideDays);
}
