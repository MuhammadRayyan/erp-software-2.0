"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification-service";

export async function markNotificationReadAction(businessId: string, notificationId: string) {
  try {
    const user = await requireUser();
    markNotificationRead(businessId, user.id, notificationId);
    revalidatePath(`/b/${businessId}`);
    return { ok: true };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to update notification.") };
  }
}

export async function markAllNotificationsReadAction(businessId: string) {
  try {
    const user = await requireUser();
    markAllNotificationsRead(businessId, user.id);
    revalidatePath(`/b/${businessId}`);
    return { ok: true };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to mark notifications read.") };
  }
}
