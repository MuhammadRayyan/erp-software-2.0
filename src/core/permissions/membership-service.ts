import crypto, { randomUUID } from "node:crypto";
import { and, eq, inArray, like, ne } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getBusinessAccess, moduleKeys, type ModuleKey } from "./permissions";
import {
  authAccounts,
  businesses,
  memberships,
  sessions,
  users,
  userSettings,
  verifications,
} from "@/core/db/system-schema";
import { getSystemDb, getSystemSqlite } from "@/core/db/system";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import {
  createInvitationToken,
  createPasswordResetToken,
} from "./invitation-service";
import {
  sendAccessGrantedEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
} from "@/modules/email/system-email-service";

export type UserInvitationStatus = "registered" | "invited" | "suspended";

export function listBusinessUsers(businessId: string, adminUserId: string) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");

  const db = getSystemDb();
  const rows = db
    .select({ user: users, membership: memberships })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.businessId, businessId))
    .all();

  // Check pending invites in verification table
  const activeInviteTokens = db
    .select()
    .from(verifications)
    .where(like(verifications.identifier, "invite:%"))
    .all();

  const userIdsWithPendingInvite = new Set<string>();
  for (const inv of activeInviteTokens) {
    try {
      const parsed = JSON.parse(inv.value);
      if (parsed.userId && parsed.businessId === businessId) {
        userIdsWithPendingInvite.add(parsed.userId);
      }
    } catch {
      // ignore
    }
  }

  // Check accounts with set passwords
  const userIdsWithAccountPassword = new Set(
    db
      .select({ userId: authAccounts.userId })
      .from(authAccounts)
      .where(ne(authAccounts.password, ""))
      .all()
      .map((a) => a.userId)
  );

  return rows.map(({ user, membership }) => {
    let invitationStatus: UserInvitationStatus = "registered";

    if (user.status === "suspended") {
      invitationStatus = "suspended";
    } else if (!user.emailVerified || userIdsWithPendingInvite.has(user.id) || !userIdsWithAccountPassword.has(user.id)) {
      invitationStatus = "invited";
    }

    return {
      user,
      membership,
      invitationStatus,
    };
  });
}

function checkUserQuota(businessId: string, adminUserId: string, targetUserId: string) {
  const db = getSystemDb();
  const currentBusiness = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  const ownerId = currentBusiness?.ownerUserId || adminUserId;
  const ownerUser = db.select().from(users).where(eq(users.id, ownerId)).get();

  if (ownerUser && !ownerUser.isSuperAdmin) {
    const allOwnerBusinesses = db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.ownerUserId, ownerId))
      .all();
    const bIds = allOwnerBusinesses.map((b) => b.id);
    if (bIds.length > 0) {
      const distinctMembers = db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(inArray(memberships.businessId, bIds), ne(memberships.userId, ownerId)))
        .all();
      const distinctSet = new Set(distinctMembers.map((m) => m.userId));
      if (!distinctSet.has(targetUserId) && distinctSet.size >= (ownerUser.maxUsers ?? 5)) {
        throw new Error(
          `QUOTA_EXCEEDED: You have reached your account limit of ${ownerUser.maxUsers ?? 5} team member(s) across your businesses. Contact your administrator to increase your limit.`
        );
      }
    }
  }
}

/**
 * Invite a team member by email and role only.
 * Dispatches an email with a secure registration link where the invited user
 * chooses their username and password.
 */
export async function inviteBusinessUser(
  businessId: string,
  adminUserId: string,
  input: {
    email: string;
    role?: "administrator" | "standard";
    modules?: ModuleKey[];
  }
) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");

  const normalized = z.email().parse(input.email.trim().toLowerCase());
  const db = getSystemDb();
  const role = input.role || "standard";
  const modules = input.modules || ["sales"];
  const safeModules = moduleKeys.filter((m) => modules.includes(m));

  let user = db.select().from(users).where(eq(users.email, normalized)).get();

  // If user does not exist, check quota with placeholder or create user record
  const targetUserId = user ? user.id : randomUUID();

  // Enforce sub-user quota
  checkUserQuota(businessId, adminUserId, targetUserId);

  if (!user) {
    const defaultName = normalized.split("@")[0] || "Team Member";
    const now = Date.now();

    getSystemSqlite().transaction(() => {
      db.insert(users)
        .values({
          id: targetUserId,
          name: defaultName,
          email: normalized,
          emailVerified: false,
          createdAt: new Date(now),
          updatedAt: new Date(now),
          isSuperAdmin: false,
          status: "active",
          maxBusinesses: 1,
          maxUsers: 1,
          isTenantAdmin: false,
          createdByUserId: adminUserId,
        })
        .run();

      db.insert(userSettings)
        .values({
          userId: targetUserId,
          themeFont: "inter",
          themeSize: "normal",
        })
        .run();
    })();

    user = db.select().from(users).where(eq(users.id, targetUserId)).get();
  }

  if (!user) throw new Error("Failed to initialize user record.");

  // Check if user is already a member of this business
  const existingMembership = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id)))
    .get();

  if (existingMembership) {
    const isPending = !user.emailVerified;
    throw new Error(
      isPending
        ? "That user already has a pending invitation to this business. You can resend their invitation from the team list."
        : "That user already has access to this business."
    );
  }

  // Create membership
  const membershipId = randomUUID();
  db.insert(memberships)
    .values({
      id: membershipId,
      businessId,
      userId: user.id,
      role,
      modulesJson: JSON.stringify(safeModules),
      createdAt: new Date().toISOString(),
    })
    .run();

  const business = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  const adminUser = db.select().from(users).where(eq(users.id, adminUserId)).get();
  const businessName = business?.name || "Business Workspace";

  // Check if user has already registered (has password and verified email)
  const existingAccount = db.select().from(authAccounts).where(eq(authAccounts.userId, user.id)).get();
  const isRegistered = Boolean(user.emailVerified && existingAccount?.password);

  let inviteUrl: string | undefined;
  let emailDeliveryResult: { success: boolean; error?: string } = { success: true };

  if (isRegistered) {
    // Already registered in the platform: notify that access was granted
    const emailRes = await sendAccessGrantedEmail({
      to: user.email,
      userName: user.name,
      businessId,
      businessName,
      role: role === "administrator" ? "Administrator" : "Standard User",
    });
    emailDeliveryResult = { success: emailRes.success, error: emailRes.error };
  } else {
    // New or unverified user: generate invitation token and send setup account link
    const token = createInvitationToken(user.id, businessId, user.email);
    const emailRes = await sendInvitationEmail({
      to: user.email,
      businessId,
      businessName,
      inviterName: adminUser?.name || "Your team administrator",
      inviteToken: token,
    });
    inviteUrl = emailRes.actionUrl;
    emailDeliveryResult = { success: emailRes.success, error: emailRes.error };
  }

  recordActivity(businessId, {
    userId: adminUserId,
    action: "created",
    entityType: "user_access",
    entityId: user.id,
    entityNumber: user.name,
    summary: isRegistered
      ? `Added registered team member ${user.name} (${user.email}) as ${role}`
      : `Sent invitation to ${user.email} as ${role} with link`,
    details: {
      targetUserId: user.id,
      targetEmail: user.email,
      role,
      modules: safeModules,
      isRegistered,
    },
  });

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    status: isRegistered ? ("registered" as const) : ("invited" as const),
    inviteUrl,
    emailDelivery: emailDeliveryResult,
  };
}

/**
 * Resend invitation email with a fresh secure token.
 */
export async function resendInvitation(businessId: string, adminUserId: string, targetUserId: string) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");

  const db = getSystemDb();
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) throw new Error("User account was not found.");

  const membership = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.businessId, businessId), eq(memberships.userId, targetUserId)))
    .get();
  if (!membership) throw new Error("User is not a member of this business.");

  const business = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  const adminUser = db.select().from(users).where(eq(users.id, adminUserId)).get();
  const businessName = business?.name || "Business Workspace";

  const token = createInvitationToken(target.id, businessId, target.email);
  const emailRes = await sendInvitationEmail({
    to: target.email,
    businessId,
    businessName,
    inviterName: adminUser?.name || "Your team administrator",
    inviteToken: token,
  });

  recordActivity(businessId, {
    userId: adminUserId,
    action: "updated",
    entityType: "user_access",
    entityId: target.id,
    entityNumber: target.email,
    summary: `Resent invitation email to ${target.email}`,
    details: { targetUserId: target.id, targetEmail: target.email },
  });

  return {
    success: true,
    inviteUrl: emailRes.actionUrl,
    emailDelivery: { success: emailRes.success, error: emailRes.error },
  };
}

/**
 * Send password reset email directly to a team member.
 */
export async function sendPasswordResetForUser(businessId: string, adminUserId: string, targetUserId: string) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");

  const db = getSystemDb();
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) throw new Error("User account was not found.");

  const { token } = createPasswordResetToken(target.email, businessId);
  const emailRes = await sendPasswordResetEmail({
    to: target.email,
    userName: target.name,
    resetToken: token,
    businessId,
  });

  recordActivity(businessId, {
    userId: adminUserId,
    action: "updated",
    entityType: "user_access",
    entityId: target.id,
    entityNumber: target.email,
    summary: `Sent password reset email to ${target.email}`,
    details: { targetUserId: target.id, targetEmail: target.email },
  });

  return {
    success: true,
    resetUrl: emailRes.actionUrl,
    emailDelivery: { success: emailRes.success, error: emailRes.error },
  };
}

/**
 * Suspend or reactivate user access to the workspace.
 */
export function toggleUserSuspension(
  businessId: string,
  adminUserId: string,
  targetUserId: string,
  status: "active" | "suspended"
) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");

  if (targetUserId === adminUserId) {
    throw new Error("You cannot suspend your own administrator account.");
  }

  const db = getSystemDb();
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) throw new Error("User was not found.");

  getSystemSqlite().transaction(() => {
    db.update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, targetUserId))
      .run();

    if (status === "suspended") {
      // Terminate any active sessions immediately
      db.delete(sessions).where(eq(sessions.userId, targetUserId)).run();
    }
  })();

  recordActivity(businessId, {
    userId: adminUserId,
    action: "settings_changed",
    entityType: "user_access",
    entityId: targetUserId,
    entityNumber: target.name,
    summary: `Changed account status to '${status}' for ${target.name} (${target.email})`,
    details: { targetUserId, newStatus: status },
  });

  return { success: true, newStatus: status };
}

/**
 * Remove user membership from the business.
 */
export function removeBusinessUser(businessId: string, adminUserId: string, membershipId: string) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");

  const db = getSystemDb();
  const target = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.businessId, businessId)))
    .get();

  if (!target) throw new Error("Membership not found.");
  if (target.userId === adminUserId) throw new Error("Use another administrator to remove your own access.");

  const targetUser = db.select().from(users).where(eq(users.id, target.userId)).get();

  getSystemSqlite().transaction(() => {
    // 1. Delete membership
    db.delete(memberships).where(eq(memberships.id, membershipId)).run();

    // 2. If target user has no other memberships and was never verified/registered, clean up unverified stub
    const remainingMemberships = db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, target.userId))
      .all();

    if (remainingMemberships.length === 0 && targetUser && !targetUser.emailVerified && !targetUser.isSuperAdmin) {
      const allInvites = db
        .select()
        .from(verifications)
        .where(like(verifications.identifier, "invite:%"))
        .all();
      for (const inv of allInvites) {
        try {
          const parsed = JSON.parse(inv.value);
          if (parsed.userId === target.userId) {
            db.delete(verifications).where(eq(verifications.id, inv.id)).run();
          }
        } catch {
          // ignore parse errors
        }
      }
      db.delete(authAccounts).where(eq(authAccounts.userId, target.userId)).run();
      db.delete(userSettings).where(eq(userSettings.userId, target.userId)).run();
      db.delete(users).where(eq(users.id, target.userId)).run();
    }
  })();

  recordActivity(businessId, {
    userId: adminUserId,
    action: "deleted",
    entityType: "user_access",
    entityId: target.userId,
    entityNumber: targetUser?.name || target.userId,
    summary: `Removed access for ${targetUser?.name || "user"} (${targetUser?.email || "email"}) from this business`,
    details: { targetUserId: target.userId },
  });

  return { success: true };
}

export function updateMembership(
  businessId: string,
  adminUserId: string,
  membershipId: string,
  role: "administrator" | "standard",
  modules: ModuleKey[]
) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");

  const target = getSystemDb()
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.businessId, businessId)))
    .get();

  if (!target) throw new Error("Membership not found");
  if (target.userId === adminUserId) throw new Error("Use another administrator to change your own access.");

  const safeModules = moduleKeys.filter((module) => modules.includes(module));
  getSystemDb()
    .update(memberships)
    .set({ role, modulesJson: JSON.stringify(safeModules) })
    .where(eq(memberships.id, membershipId))
    .run();

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

/**
 * Backward compatibility helper for direct user creation (used in legacy seeds/tests).
 */
export async function createAndAddBusinessUser(
  businessId: string,
  adminUserId: string,
  input: {
    name: string;
    email: string;
    password?: string;
    role?: "administrator" | "standard";
    modules?: ModuleKey[];
  }
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
      db.insert(users)
        .values({
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
        })
        .run();

      db.insert(authAccounts)
        .values({
          id: accountId,
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashedPassword,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .run();

      db.insert(userSettings)
        .values({
          userId,
          themeFont: "inter",
          themeSize: "normal",
        })
        .run();
    })();

    user = db.select().from(users).where(eq(users.id, userId)).get();
  }

  if (!user) throw new Error("Failed to create user.");

  checkUserQuota(businessId, adminUserId, user.id);

  const existing = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id)))
    .get();
  if (existing) throw new Error("That user already has access to this business.");

  const role = input.role || "standard";
  const modules = input.modules || ["sales"];
  const safeModules = moduleKeys.filter((m) => modules.includes(m));

  db.insert(memberships)
    .values({
      id: randomUUID(),
      businessId,
      userId: user.id,
      role,
      modulesJson: JSON.stringify(safeModules),
      createdAt: new Date().toISOString(),
    })
    .run();

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

/**
 * Backward compatibility helper for adding an existing user by email.
 */
export function addExistingUser(businessId: string, adminUserId: string, email: string) {
  const access = getBusinessAccess(businessId, adminUserId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const normalized = z.email().parse(email.trim().toLowerCase());
  const db = getSystemDb();
  const user = db.select().from(users).where(eq(users.email, normalized)).get();
  if (!user) throw new Error("No local user has that email. Invitation emails are not available.");
  const existing = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id)))
    .get();
  if (existing) throw new Error("That user already has access to this business.");

  checkUserQuota(businessId, adminUserId, user.id);

  db.insert(memberships)
    .values({
      id: randomUUID(),
      businessId,
      userId: user.id,
      role: "standard",
      modulesJson: JSON.stringify(["sales"]),
      createdAt: new Date().toISOString(),
    })
    .run();

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
