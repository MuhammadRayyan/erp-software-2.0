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
