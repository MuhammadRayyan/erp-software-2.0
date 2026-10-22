"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createTenantAccount,
  resetTenantPassword,
  toggleTenantSuspension,
  updateTenantQuotas,
  type CreateTenantInput,
} from "@/core/admin/tenant-service";
import { requireSuperAdmin } from "@/core/auth/session";
import { getSystemDb, getSystemSqlite } from "@/core/db/system";
import { businesses, systemLogs } from "@/core/db/system-schema";

export type ActionResult<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  newStatus?: "active" | "suspended";
};

export async function createTenantAction(
  rawInput: CreateTenantInput
): Promise<ActionResult<{ id: string; email: string; name: string }>> {
  try {
    const superAdmin = await requireSuperAdmin();
    const result = await createTenantAccount(rawInput, superAdmin.id);
    revalidatePath("/admin");
    return { success: true, data: result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create tenant account." };
  }
}

export async function updateTenantQuotasAction(
  tenantUserId: string,
  quotas: { maxBusinesses: number; maxUsers: number }
): Promise<ActionResult> {
  try {
    const superAdmin = await requireSuperAdmin();
    updateTenantQuotas(tenantUserId, quotas, superAdmin.id);
    revalidatePath("/admin");
    revalidatePath(`/admin/tenants/${tenantUserId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update tenant quotas." };
  }
}

export async function toggleTenantSuspensionAction(
  tenantUserId: string,
  targetStatus: "active" | "suspended"
): Promise<ActionResult> {
  try {
    const superAdmin = await requireSuperAdmin();
    const res = toggleTenantSuspension(tenantUserId, targetStatus, superAdmin.id);
    revalidatePath("/admin");
    revalidatePath(`/admin/tenants/${tenantUserId}`);
    return { success: true, newStatus: res.newStatus };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to toggle tenant suspension." };
  }
}

export async function resetTenantPasswordAction(
  tenantUserId: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    const superAdmin = await requireSuperAdmin();
    await resetTenantPassword(tenantUserId, newPassword, superAdmin.id);
    revalidatePath("/admin");
    revalidatePath(`/admin/tenants/${tenantUserId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reset password." };
  }
}

export async function toggleBusinessSuspensionAction(
  businessId: string,
  targetStatus: "active" | "suspended"
): Promise<ActionResult> {
  const superAdmin = await requireSuperAdmin();

  if (!businessId) {
    return { error: "Business ID is required." };
  }
  if (targetStatus !== "active" && targetStatus !== "suspended") {
    return { error: "Invalid business target status." };
  }

  const db = getSystemDb();
  const existing = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!existing) {
    return { error: "Target business was not found." };
  }

  const now = new Date().toISOString();

  try {
    getSystemSqlite().transaction(() => {
      db.update(businesses)
        .set({ status: targetStatus, updatedAt: now })
        .where(eq(businesses.id, businessId))
        .run();

      db.insert(systemLogs)
        .values({
          id: crypto.randomUUID(),
          level: targetStatus === "suspended" ? "warn" : "info",
          message: `Business '${existing.name}' status changed to '${targetStatus}' by Super-Admin ${superAdmin.email}`,
          businessId,
          userId: superAdmin.id,
          createdAt: now,
        })
        .run();
    })();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update business status." };
  }

  revalidatePath("/admin");
  revalidatePath("/super-admin");
  revalidatePath("/businesses");
  revalidatePath(`/b/${businessId}`);

  return { success: true, newStatus: targetStatus };
}
