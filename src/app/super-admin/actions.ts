"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "@/core/auth/session";
import { getSystemDb, getSystemSqlite } from "@/core/db/system";
import { businesses, systemLogs } from "@/core/db/system-schema";

export type SuspensionActionResult = {
  success?: boolean;
  error?: string;
  newStatus?: "active" | "suspended";
};

export async function toggleBusinessSuspensionAction(
  businessId: string,
  targetStatus: "active" | "suspended",
): Promise<SuspensionActionResult> {
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
          level: "info",
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

  revalidatePath("/super-admin");
  revalidatePath("/businesses");
  revalidatePath(`/b/${businessId}`);

  return { success: true, newStatus: targetStatus };
}
