import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getBusinessAccess, moduleKeys, type ModuleKey } from "./permissions";
import { memberships, users } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";

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
  if (!user) throw new Error("No local user has that email. Phase 0 does not send invitations.");
  const existing = getSystemDb().select().from(memberships).where(and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id))).get();
  if (existing) throw new Error("That user already has access to this business.");
  getSystemDb().insert(memberships).values({ id: randomUUID(), businessId, userId: user.id, role: "standard", modulesJson: JSON.stringify(["sales"]), createdAt: new Date().toISOString() }).run();
}

export function updateMembership(businessId: string, adminUserId: string, membershipId: string, role: "administrator" | "standard", modules: ModuleKey[]) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const target = getSystemDb().select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.businessId, businessId))).get();
  if (!target) throw new Error("Membership not found");
  if (target.userId === adminUserId) throw new Error("Use another administrator to change your own access.");
  const safeModules = moduleKeys.filter((module) => modules.includes(module));
  getSystemDb().update(memberships).set({ role, modulesJson: JSON.stringify(safeModules) }).where(eq(memberships.id, membershipId)).run();
}
