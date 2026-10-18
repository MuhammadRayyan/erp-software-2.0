import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getBusinessAccess, moduleKeys, type ModuleKey } from "./permissions";
import { memberships, users } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { recordActivity } from "@/modules/activity-log/activity-log-service";

export function listBusinessUsers(businessId: string, adminUserId: string) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  return getSystemDb()
    .select({ user: users, membership: memberships })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.businessId, businessId))
    .all();
}

export function addExistingUser(businessId: string, adminUserId: string, email: string) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const normalized = z.email().parse(email.trim().toLowerCase());
  const user = getSystemDb().select().from(users).where(eq(users.email, normalized)).get();
  if (!user) throw new Error("No local user has that email. Invitation emails are not available.");
  const existing = getSystemDb().select().from(memberships).where(and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id))).get();
  if (existing) throw new Error("That user already has access to this business.");
  getSystemDb().insert(memberships).values({ id: randomUUID(), businessId, userId: user.id, role: "standard", modulesJson: JSON.stringify(["sales"]), createdAt: new Date().toISOString() }).run();

  recordActivity(businessId, {
    userId: adminUserId,
    action: "created",
    entityType: "user_access",
    entityId: user.id,
    entityNumber: user.name,
    summary: `Added team member ${user.name} (${user.email}) as standard user`,
    details: { targetUserId: user.id, targetEmail: user.email, role: "standard" },
  });
}

export function updateMembership(businessId: string, adminUserId: string, membershipId: string, role: "administrator" | "standard", modules: ModuleKey[]) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const target = getSystemDb().select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.businessId, businessId))).get();
  if (!target) throw new Error("Membership not found");
  if (target.userId === adminUserId) throw new Error("Use another administrator to change your own access.");
  const safeModules = moduleKeys.filter((module) => modules.includes(module));
  getSystemDb().update(memberships).set({ role, modulesJson: JSON.stringify(safeModules) }).where(eq(memberships.id, membershipId)).run();

  const targetUser = getSystemDb().select().from(users).where(eq(users.id, target.userId)).get();
  recordActivity(businessId, {
    userId: adminUserId,
    action: "settings_changed",
    entityType: "user_access",
    entityId: target.userId,
    entityNumber: targetUser?.name || target.userId,
    summary: `Updated access role to '${role}' for ${targetUser?.name || "user"} (${targetUser?.email || "email"})`,
    details: { targetUserId: target.userId, role, modules: safeModules },
  });
}
