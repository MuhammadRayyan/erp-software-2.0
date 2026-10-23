import crypto, { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getSystemDb, getSystemSqlite } from "@/core/db/system";
import {
  authAccounts,
  businesses,
  sessions,
  users,
  userSettings,
  verifications,
} from "@/core/db/system-schema";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { getAppBaseUrl } from "@/core/config/app-url";


export interface InvitationPayload {
  userId: string;
  businessId: string;
  email: string;
}

export interface PasswordResetPayload {
  userId: string;
  email: string;
  businessId?: string;
}

/**
 * Generate a cryptographically secure token and persist in verification table.
 */
export function createInvitationToken(userId: string, businessId: string, email: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const identifier = `invite:${token}`;
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  const payload: InvitationPayload = {
    userId,
    businessId,
    email: email.trim().toLowerCase(),
  };

  const db = getSystemDb();

  // Clear any existing invite tokens for this exact user and business
  const existingInvites = db
    .select()
    .from(verifications)
    .where(like(verifications.identifier, "invite:%"))
    .all();

  for (const inv of existingInvites) {
    try {
      const data = JSON.parse(inv.value) as InvitationPayload;
      if (data.userId === userId && data.businessId === businessId) {
        db.delete(verifications).where(eq(verifications.id, inv.id)).run();
      }
    } catch {
      // ignore parse error
    }
  }

  db.insert(verifications)
    .values({
      id: randomUUID(),
      identifier,
      value: JSON.stringify(payload),
      expiresAt: new Date(expiresAt),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .run();

  return token;
}

/**
 * Generate a full invitation link with cryptographic token.
 */
export function generateInvitationLink(userId: string, businessId: string, email: string): string {
  const token = createInvitationToken(userId, businessId, email);
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

/**
 * Verify validity of an invitation token.
 */
export function verifyInvitationToken(token: string) {
  if (!token?.trim()) {
    return { valid: false, error: "Invitation token is required." };
  }

  const db = getSystemDb();
  const identifier = `invite:${token.trim()}`;
  const row = db.select().from(verifications).where(eq(verifications.identifier, identifier)).get();

  if (!row) {
    return { valid: false, error: "Invitation link is invalid or has expired." };
  }

  const expiresTime = row.expiresAt instanceof Date ? row.expiresAt.getTime() : Number(row.expiresAt);
  if (expiresTime <= Date.now()) {
    // Delete expired token
    db.delete(verifications).where(eq(verifications.id, row.id)).run();
    return { valid: false, error: "Invitation link has expired. Please request a new invitation from your administrator." };
  }

  try {
    const payload = JSON.parse(row.value) as InvitationPayload;
    const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
    if (!user) {
      return { valid: false, error: "The associated user account was not found." };
    }
    if (user.status === "suspended") {
      return { valid: false, error: "This account has been suspended. Please contact your system administrator." };
    }

    const business = db.select().from(businesses).where(eq(businesses.id, payload.businessId)).get();
    if (!business) {
      return { valid: false, error: "The associated business was not found." };
    }

    return {
      valid: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        businessId: business.id,
        businessName: business.name,
        emailVerified: user.emailVerified,
      },
    };
  } catch {
    return { valid: false, error: "Failed to read invitation token data." };
  }
}

/**
 * Accept an invitation: Set username/full name, initial password, and activate account.
 */
export async function completeInvitation(token: string, name: string, password: string) {
  const verified = verifyInvitationToken(token);
  if (!verified.valid || !verified.data) {
    throw new Error(verified.error || "Invalid invitation token.");
  }

  const cleanName = name.trim();
  if (cleanName.length < 2) {
    throw new Error("Full name must be at least 2 characters long.");
  }
  if (!password || password.trim().length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const hashedPassword = await hashPassword(password);
  const db = getSystemDb();
  const { userId, businessId, email } = verified.data;
  const now = Date.now();

  getSystemSqlite().transaction(() => {
    // 1. Update user profile
    db.update(users)
      .set({
        name: cleanName,
        emailVerified: true,
        status: "active",
        updatedAt: new Date(now),
      })
      .where(eq(users.id, userId))
      .run();

    // 2. Insert or update credential account
    const existingAccount = db.select().from(authAccounts).where(eq(authAccounts.userId, userId)).get();
    if (existingAccount) {
      db.update(authAccounts)
        .set({
          password: hashedPassword,
          updatedAt: new Date(now),
        })
        .where(eq(authAccounts.id, existingAccount.id))
        .run();
    } else {
      db.insert(authAccounts)
        .values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashedPassword,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .run();
    }

    // 3. User settings defaults
    db.insert(userSettings)
      .values({
        userId,
        themeFont: "inter",
        themeSize: "normal",
      })
      .onConflictDoNothing()
      .run();

    // 4. Invalidate invitation token
    db.delete(verifications).where(eq(verifications.identifier, `invite:${token.trim()}`)).run();
  })();

  recordActivity(businessId, {
    userId,
    action: "updated",
    entityType: "user_access",
    entityId: userId,
    entityNumber: cleanName,
    summary: `Team member ${cleanName} (${email}) completed invitation registration and password setup`,
    details: { targetUserId: userId, email },
  });

  return {
    userId,
    name: cleanName,
    email,
    businessId,
  };
}

/**
 * Generate a password reset token for a registered user.
 */
export function createPasswordResetToken(email: string, businessId?: string): { token: string; user: typeof users.$inferSelect } {
  const normalized = email.trim().toLowerCase();
  const db = getSystemDb();
  const user = db.select().from(users).where(eq(users.email, normalized)).get();

  if (!user) {
    throw new Error("No user account was found with that email address.");
  }
  if (user.status === "suspended") {
    throw new Error("This account has been suspended. Please contact your system administrator.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const identifier = `reset-password:${token}`;
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

  const payload: PasswordResetPayload = {
    userId: user.id,
    email: user.email,
    businessId,
  };

  // Clear existing reset tokens for this user
  const existingResets = db
    .select()
    .from(verifications)
    .where(like(verifications.identifier, "reset-password:%"))
    .all();

  for (const r of existingResets) {
    try {
      const data = JSON.parse(r.value) as PasswordResetPayload;
      if (data.userId === user.id) {
        db.delete(verifications).where(eq(verifications.id, r.id)).run();
      }
    } catch {
      // ignore
    }
  }

  db.insert(verifications)
    .values({
      id: randomUUID(),
      identifier,
      value: JSON.stringify(payload),
      expiresAt: new Date(expiresAt),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .run();

  return { token, user };
}

/**
 * Generate a full password reset link with cryptographic token.
 */
export function generatePasswordResetLink(email: string, businessId?: string): { link: string; token: string; user: typeof users.$inferSelect } {
  const { token, user } = createPasswordResetToken(email, businessId);
  const baseUrl = getAppBaseUrl();
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return { link, token, user };
}

/**
 * Verify validity of a password reset token.
 */
export function verifyPasswordResetToken(token: string) {
  if (!token?.trim()) {
    return { valid: false, error: "Password reset token is required." };
  }

  const db = getSystemDb();
  const identifier = `reset-password:${token.trim()}`;
  const row = db.select().from(verifications).where(eq(verifications.identifier, identifier)).get();

  if (!row) {
    return { valid: false, error: "Password reset link is invalid or has already been used." };
  }

  const expiresTime = row.expiresAt instanceof Date ? row.expiresAt.getTime() : Number(row.expiresAt);
  if (expiresTime <= Date.now()) {
    db.delete(verifications).where(eq(verifications.id, row.id)).run();
    return { valid: false, error: "Password reset link has expired. Please request a new one." };
  }

  try {
    const payload = JSON.parse(row.value) as PasswordResetPayload;
    const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
    if (!user) {
      return { valid: false, error: "User account no longer exists." };
    }
    if (user.status === "suspended") {
      return { valid: false, error: "This account has been suspended. Please contact your system administrator." };
    }

    return {
      valid: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        businessId: payload.businessId,
      },
    };
  } catch {
    return { valid: false, error: "Failed to read password reset token data." };
  }
}

/**
 * Complete password reset with a new password.
 */
export async function completePasswordReset(token: string, newPassword: string) {
  const verified = verifyPasswordResetToken(token);
  if (!verified.valid || !verified.data) {
    throw new Error(verified.error || "Invalid password reset token.");
  }

  if (!newPassword || newPassword.trim().length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const hashedPassword = await hashPassword(newPassword);
  const db = getSystemDb();
  const { userId, email, businessId } = verified.data;
  const now = Date.now();

  getSystemSqlite().transaction(() => {
    // 1. Update password
    const existing = db.select().from(authAccounts).where(eq(authAccounts.userId, userId)).get();
    if (existing) {
      db.update(authAccounts)
        .set({
          password: hashedPassword,
          updatedAt: new Date(now),
        })
        .where(eq(authAccounts.id, existing.id))
        .run();
    } else {
      db.insert(authAccounts)
        .values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashedPassword,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .run();
    }

    // 2. Ensure emailVerified is marked true (DO NOT overwrite suspension status)
    db.update(users)
      .set({ emailVerified: true, updatedAt: new Date(now) })
      .where(eq(users.id, userId))
      .run();

    // 3. Revoke all active sessions so user must log in with new password
    db.delete(sessions).where(eq(sessions.userId, userId)).run();

    // 4. Invalidate reset token
    db.delete(verifications).where(eq(verifications.identifier, `reset-password:${token.trim()}`)).run();
  })();

  if (businessId) {
    recordActivity(businessId, {
      userId,
      action: "updated",
      entityType: "user_access",
      entityId: userId,
      entityNumber: email,
      summary: `User ${email} successfully reset their password`,
      details: { targetUserId: userId, email },
    });
  }

  return { success: true, email };
}
