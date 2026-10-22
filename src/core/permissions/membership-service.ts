import crypto, { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getBusinessAccess, moduleKeys, type ModuleKey } from "./permissions";
import { authAccounts, businesses, memberships, users, userSettings } from "@/core/db/system-schema";
import { getSystemDb, getSystemSqlite } from "@/core/db/system";
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
  const db = getSystemDb();
  const user = db.select().from(users).where(eq(users.email, normalized)).get();
  if (!user) throw new Error("No local user has that email. Invitation emails are not available.");
  const existing = db.select().from(memberships).where(and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id))).get();
  if (existing) throw new Error("That user already has access to this business.");

  // Enforce maxUsers quota for the business owner
  const currentBusiness = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  const ownerId = currentBusiness?.ownerUserId || adminUserId;
  const ownerUser = db.select().from(users).where(eq(users.id, ownerId)).get();
  if (ownerUser && !ownerUser.isSuperAdmin) {
    const allOwnerBusinesses = db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerUserId, ownerId)).all();
    const bIds = allOwnerBusinesses.map((b) => b.id);
    if (bIds.length > 0) {
      const distinctMembers = db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(inArray(memberships.businessId, bIds), ne(memberships.userId, ownerId)))
        .all();
      const distinctSet = new Set(distinctMembers.map((m) => m.userId));
      if (!distinctSet.has(user.id) && distinctSet.size >= (ownerUser.maxUsers ?? 5)) {
        throw new Error(
          `QUOTA_EXCEEDED: You have reached your account limit of ${ownerUser.maxUsers ?? 5} team member(s) across your businesses. Contact your administrator to increase your limit.`,
        );
      }
    }
  }

  db.insert(memberships).values({ id: randomUUID(), businessId, userId: user.id, role: "standard", modulesJson: JSON.stringify(["sales"]), createdAt: new Date().toISOString() }).run();

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

export async function createAndAddBusinessUser(
  businessId: string,
  adminUserId: string,
  input: { name: string; email: string; password?: string; role?: "administrator" | "standard"; modules?: ModuleKey[] },
) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const normalized = z.email().parse(input.email.trim().toLowerCase());
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Name must be at least 2 characters.");

  const db = getSystemDb();
  let user = db.select().from(users).where(eq(users.email, normalized)).get();

  if (!user) {
    const rawPassword = input.password?.trim() || crypto.randomBytes(6).toString("base64url");
    if (rawPassword.length < 8) throw new Error("Password must be at least 8 characters.");
    const hashedPassword = await hashPassword(rawPassword);
    const userId = randomUUID();
    const accountId = randomUUID();
    const now = Date.now();

    getSystemSqlite().transaction(() => {
      db.insert(users).values({
        id: userId,
        name,
        email: normalized,
        emailVerified: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        isSuperAdmin: false,
        status: "active",
        maxBusinesses: 1,
        maxUsers: 1,
        isTenantAdmin: false,
        createdByUserId: adminUserId,
      }).run();

      db.insert(authAccounts).values({
        id: accountId,
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      db.insert(userSettings).values({
        userId,
        themeFont: "inter",
        themeSize: "normal",
      }).run();
    })();

    user = db.select().from(users).where(eq(users.id, userId)).get();
  }

  if (!user) throw new Error("Failed to create user.");

  // Check sub-user quota
  const currentBusiness = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  const ownerId = currentBusiness?.ownerUserId || adminUserId;
  const ownerUser = db.select().from(users).where(eq(users.id, ownerId)).get();
  if (ownerUser && !ownerUser.isSuperAdmin) {
    const allOwnerBusinesses = db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerUserId, ownerId)).all();
    const bIds = allOwnerBusinesses.map((b) => b.id);
    if (bIds.length > 0) {
      const distinctMembers = db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(inArray(memberships.businessId, bIds), ne(memberships.userId, ownerId)))
        .all();
      const distinctSet = new Set(distinctMembers.map((m) => m.userId));
      if (!distinctSet.has(user.id) && distinctSet.size >= (ownerUser.maxUsers ?? 5)) {
        throw new Error(
          `QUOTA_EXCEEDED: You have reached your account limit of ${ownerUser.maxUsers ?? 5} team member(s) across your businesses. Contact your administrator to increase your limit.`,
        );
      }
    }
  }

  const existing = db.select().from(memberships).where(and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id))).get();
  if (existing) throw new Error("That user already has access to this business.");

  const role = input.role || "standard";
  const modules = input.modules || ["sales"];
  const safeModules = moduleKeys.filter((m) => modules.includes(m));

  db.insert(memberships).values({
    id: randomUUID(),
    businessId,
    userId: user.id,
    role,
    modulesJson: JSON.stringify(safeModules),
    createdAt: new Date().toISOString(),
  }).run();

  recordActivity(businessId, {
    userId: adminUserId,
    action: "created",
    entityType: "user_access",
    entityId: user.id,
    entityNumber: user.name,
    summary: `Created and assigned team member ${user.name} (${user.email}) as ${role}`,
    details: { targetUserId: user.id, targetEmail: user.email, role, modules: safeModules },
  });

  return { userId: user.id, name: user.name, email: user.email };
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
