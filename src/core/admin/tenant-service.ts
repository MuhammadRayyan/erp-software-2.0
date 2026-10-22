import { existsSync, statSync } from "node:fs";
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getBusinessPaths } from "@/core/db/paths";
import { getSystemDb, getSystemSqlite } from "@/core/db/system";
import {
  authAccounts,
  businesses,
  memberships,
  sessions,
  systemLogs,
  users,
} from "@/core/db/system-schema";
import { parseModules } from "@/core/permissions/permissions";

export function getBusinessStorageBytes(directoryKey: string): number {
  try {
    const paths = getBusinessPaths(directoryKey);
    let total = 0;
    if (existsSync(paths.database)) total += statSync(paths.database).size;
    if (existsSync(`${paths.database}-wal`)) total += statSync(`${paths.database}-wal`).size;
    if (existsSync(`${paths.database}-shm`)) total += statSync(`${paths.database}-shm`).size;
    return total;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Invalid email address.").transform((val) => val.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters."),
  maxBusinesses: z.coerce.number().int().min(1, "Max businesses must be at least 1.").default(3),
  maxUsers: z.coerce.number().int().min(1, "Max sub-users must be at least 1.").default(5),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export type TenantSummaryRow = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  maxBusinesses: number;
  maxUsers: number;
  createdAt: number;
  businessCount: number;
  subUsersCount: number;
  storageBytes: number;
  storageFormatted: string;
};

export function listTenantsWithStats(): TenantSummaryRow[] {
  const db = getSystemDb();
  const allUsers = db.select().from(users).orderBy(desc(users.createdAt)).all();
  const allBusinesses = db.select().from(businesses).all();
  const allMemberships = db.select().from(memberships).all();

  // Filter for Account Holders (Super-Admin, Tenant Admins, or Users who own at least one business).
  // Sub-users / team members invited to a business without ownership or tenant admin rights are excluded.
  const accountHolders = allUsers.filter((u) => {
    if (u.isSuperAdmin || u.isTenantAdmin) return true;
    const hasOwnedBusiness = allBusinesses.some(
      (b) => b.ownerUserId === u.id && b.status !== "trash"
    );
    if (hasOwnedBusiness) return true;
    const hasLegacyOwned = allBusinesses.some((b) => {
      if (b.ownerUserId) return false;
      const firstAdmin = allMemberships
        .filter((m) => m.businessId === b.id && m.role === "administrator")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return firstAdmin?.userId === u.id;
    });
    return hasLegacyOwned;
  });

  return accountHolders.map((u) => {
    // Find businesses owned by this user
    const ownedBusinesses = allBusinesses.filter(
      (b) => b.ownerUserId === u.id && b.status !== "trash"
    );

    // If no explicit ownerUserId was populated (e.g. legacy), fallback to first admin
    const legacyOwned = allBusinesses.filter((b) => {
      if (b.ownerUserId) return false;
      const firstAdmin = allMemberships
        .filter((m) => m.businessId === b.id && m.role === "administrator")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return firstAdmin?.userId === u.id;
    });

    const combinedBusinesses = [...ownedBusinesses, ...legacyOwned];
    const uniqueBusinessIds = Array.from(new Set(combinedBusinesses.map((b) => b.id)));

    // Calculate sub-users across all owned businesses
    const subUserIds = new Set<string>();
    for (const bId of uniqueBusinessIds) {
      const bMembers = allMemberships.filter((m) => m.businessId === bId && m.userId !== u.id);
      for (const m of bMembers) {
        subUserIds.add(m.userId);
      }
    }

    let storageBytes = 0;
    for (const b of combinedBusinesses) {
      storageBytes += getBusinessStorageBytes(b.directoryKey);
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      status: (u.status as "active" | "suspended") || "active",
      isSuperAdmin: Boolean(u.isSuperAdmin),
      isTenantAdmin: Boolean(u.isTenantAdmin),
      maxBusinesses: u.maxBusinesses ?? 3,
      maxUsers: u.maxUsers ?? 5,
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : Number(u.createdAt),
      businessCount: uniqueBusinessIds.length,
      subUsersCount: subUserIds.size,
      storageBytes,
      storageFormatted: formatBytes(storageBytes),
    };
  });
}

export type TenantDetails = {
  user: {
    id: string;
    name: string;
    email: string;
    status: "active" | "suspended";
    isSuperAdmin: boolean;
    isTenantAdmin: boolean;
    maxBusinesses: number;
    maxUsers: number;
    createdAt: number;
    createdByUserId: string | null;
  };
  businesses: {
    id: string;
    name: string;
    country: string;
    currency: string;
    directoryKey: string;
    status: "active" | "suspended" | "trash";
    createdAt: string;
    lastOpenedAt: string | null;
    memberCount: number;
    storageFormatted: string;
    storageBytes: number;
  }[];
  subUsers: {
    userId: string;
    name: string;
    email: string;
    status: "active" | "suspended";
    businessId: string;
    businessName: string;
    role: "administrator" | "standard";
    modules: string[];
  }[];
};

export function getTenantDetails(tenantUserId: string): TenantDetails | null {
  const db = getSystemDb();
  const user = db.select().from(users).where(eq(users.id, tenantUserId)).get();
  if (!user) return null;

  const allBusinesses = db.select().from(businesses).all();
  const allMemberships = db.select().from(memberships).all();
  const allUsers = db.select().from(users).all();
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  // Businesses owned by this user
  const owned = allBusinesses.filter((b) => {
    if (b.ownerUserId === tenantUserId) return true;
    if (!b.ownerUserId) {
      const firstAdmin = allMemberships
        .filter((m) => m.businessId === b.id && m.role === "administrator")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return firstAdmin?.userId === tenantUserId;
    }
    return false;
  });

  const businessList = owned.map((b) => {
    const members = allMemberships.filter((m) => m.businessId === b.id);
    const storageBytes = getBusinessStorageBytes(b.directoryKey);
    return {
      id: b.id,
      name: b.name,
      country: b.country,
      currency: b.currency,
      directoryKey: b.directoryKey,
      status: b.status,
      createdAt: b.createdAt,
      lastOpenedAt: b.lastOpenedAt,
      memberCount: members.length,
      storageFormatted: formatBytes(storageBytes),
      storageBytes,
    };
  });

  const subUsers: TenantDetails["subUsers"] = [];
  for (const b of owned) {
    const bMembers = allMemberships.filter((m) => m.businessId === b.id && m.userId !== tenantUserId);
    for (const m of bMembers) {
      const u = userMap.get(m.userId);
      if (u) {
        subUsers.push({
          userId: u.id,
          name: u.name,
          email: u.email,
          status: (u.status as "active" | "suspended") || "active",
          businessId: b.id,
          businessName: b.name,
          role: m.role,
          modules: parseModules(m.role, m.modulesJson),
        });
      }
    }
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      status: (user.status as "active" | "suspended") || "active",
      isSuperAdmin: Boolean(user.isSuperAdmin),
      isTenantAdmin: Boolean(user.isTenantAdmin),
      maxBusinesses: user.maxBusinesses ?? 3,
      maxUsers: user.maxUsers ?? 5,
      createdAt: user.createdAt instanceof Date ? user.createdAt.getTime() : Number(user.createdAt),
      createdByUserId: user.createdByUserId ?? null,
    },
    businesses: businessList,
    subUsers,
  };
}

export async function createTenantAccount(
  rawInput: CreateTenantInput,
  superAdminUserId: string
) {
  const input = createTenantSchema.parse(rawInput);
  const db = getSystemDb();
  const sqlite = getSystemSqlite();

  // 1. Verify super admin
  const superAdmin = db.select().from(users).where(eq(users.id, superAdminUserId)).get();
  if (!superAdmin || !superAdmin.isSuperAdmin) {
    throw new Error("PERMISSION_DENIED: Only super-administrators can provision tenant accounts.");
  }

  // 2. Check for duplicate email
  const existing = db.select().from(users).where(eq(users.email, input.email)).get();
  if (existing) {
    throw new Error(`DUPLICATE_EMAIL: A user with email '${input.email}' already exists.`);
  }

  // 3. Hash password
  const hashedPassword = await hashPassword(input.password);

  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = Date.now();
  const isoNow = new Date().toISOString();

  sqlite.transaction(() => {
    sqlite
      .prepare(`
        INSERT INTO user (
          id, name, email, emailVerified, createdAt, updatedAt,
          is_super_admin, status, max_businesses, max_users, is_tenant_admin, created_by_user_id
        ) VALUES (?, ?, ?, 1, ?, ?, 0, 'active', ?, ?, 1, ?)
      `)
      .run(userId, input.name, input.email, now, now, input.maxBusinesses, input.maxUsers, superAdminUserId);

    sqlite
      .prepare(`
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
        VALUES (?, ?, 'credential', ?, ?, ?, ?)
      `)
      .run(accountId, userId, userId, hashedPassword, now, now);

    sqlite
      .prepare(`
        INSERT OR IGNORE INTO user_settings (user_id, theme_font, theme_size)
        VALUES (?, 'inter', 'normal')
      `)
      .run(userId);

    sqlite
      .prepare(`
        INSERT INTO system_logs (id, level, message, user_id, created_at)
        VALUES (?, 'info', ?, ?, ?)
      `)
      .run(
        crypto.randomUUID(),
        `Created tenant account holder '${input.name}' (${input.email}) with limits: max ${input.maxBusinesses} businesses, max ${input.maxUsers} users. Provisioned by ${superAdmin.email}`,
        superAdminUserId,
        isoNow
      );
  })();

  return {
    id: userId,
    name: input.name,
    email: input.email,
    maxBusinesses: input.maxBusinesses,
    maxUsers: input.maxUsers,
    status: "active" as const,
  };
}

export function updateTenantQuotas(
  tenantUserId: string,
  quotas: { maxBusinesses: number; maxUsers: number },
  superAdminUserId: string
) {
  const db = getSystemDb();
  const superAdmin = db.select().from(users).where(eq(users.id, superAdminUserId)).get();
  if (!superAdmin || !superAdmin.isSuperAdmin) {
    throw new Error("PERMISSION_DENIED: Only super-administrators can update account limits.");
  }

  const tenant = db.select().from(users).where(eq(users.id, tenantUserId)).get();
  if (!tenant) {
    throw new Error("Account holder not found.");
  }

  const maxBusinesses = Math.max(1, Math.floor(quotas.maxBusinesses));
  const maxUsers = Math.max(1, Math.floor(quotas.maxUsers));
  const now = new Date().toISOString();

  getSystemSqlite().transaction(() => {
    db.update(users)
      .set({
        maxBusinesses,
        maxUsers,
        updatedAt: new Date(now),
      })
      .where(eq(users.id, tenantUserId))
      .run();

    db.insert(systemLogs)
      .values({
        id: crypto.randomUUID(),
        level: "info",
        message: `Updated quotas for tenant '${tenant.name}' (${tenant.email}): max businesses = ${maxBusinesses}, max users = ${maxUsers}. Modified by ${superAdmin.email}`,
        userId: superAdminUserId,
        createdAt: now,
      })
      .run();
  })();

  return { success: true, maxBusinesses, maxUsers };
}

export function toggleTenantSuspension(
  tenantUserId: string,
  targetStatus: "active" | "suspended",
  superAdminUserId: string
) {
  const db = getSystemDb();
  const superAdmin = db.select().from(users).where(eq(users.id, superAdminUserId)).get();
  if (!superAdmin || !superAdmin.isSuperAdmin) {
    throw new Error("PERMISSION_DENIED: Only super-administrators can suspend or reactivate accounts.");
  }

  const target = db.select().from(users).where(eq(users.id, tenantUserId)).get();
  if (!target) {
    throw new Error("Target account was not found.");
  }

  if (target.isSuperAdmin) {
    throw new Error("CANNOT_SUSPEND_SUPER_ADMIN: Platform super-admin root account cannot be suspended.");
  }

  const now = new Date().toISOString();

  getSystemSqlite().transaction(() => {
    // 1. Update user status
    db.update(users)
      .set({
        status: targetStatus,
        updatedAt: new Date(now),
      })
      .where(eq(users.id, tenantUserId))
      .run();

    // 2. If suspending, immediately purge all active sessions to revoke access
    if (targetStatus === "suspended") {
      db.delete(sessions).where(eq(sessions.userId, tenantUserId)).run();
    }

    // 3. Record audit log
    db.insert(systemLogs)
      .values({
        id: crypto.randomUUID(),
        level: targetStatus === "suspended" ? "warn" : "info",
        message: `Tenant account '${target.name}' (${target.email}) status changed to '${targetStatus}' by Super-Admin ${superAdmin.email}. Active sessions revoked: ${targetStatus === "suspended"}`,
        userId: superAdminUserId,
        createdAt: now,
      })
      .run();
  })();

  return { success: true, newStatus: targetStatus };
}

export async function resetTenantPassword(
  tenantUserId: string,
  newPassword: string,
  superAdminUserId: string
) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("WEAK_PASSWORD: Password must be at least 8 characters long.");
  }

  const db = getSystemDb();
  const superAdmin = db.select().from(users).where(eq(users.id, superAdminUserId)).get();
  if (!superAdmin || !superAdmin.isSuperAdmin) {
    throw new Error("PERMISSION_DENIED: Only super-administrators can reset tenant passwords.");
  }

  const target = db.select().from(users).where(eq(users.id, tenantUserId)).get();
  if (!target) {
    throw new Error("Target account was not found.");
  }

  const hashedPassword = await hashPassword(newPassword);
  const now = new Date().toISOString();

  getSystemSqlite().transaction(() => {
    // Update password in account table
    db.update(authAccounts)
      .set({
        password: hashedPassword,
        updatedAt: new Date(now),
      })
      .where(eq(authAccounts.userId, tenantUserId))
      .run();

    // Revoke all existing sessions so tenant must sign in with new credentials
    db.delete(sessions).where(eq(sessions.userId, tenantUserId)).run();

    db.insert(systemLogs)
      .values({
        id: crypto.randomUUID(),
        level: "warn",
        message: `Password reset for tenant '${target.name}' (${target.email}) by Super-Admin ${superAdmin.email}. Existing sessions revoked.`,
        userId: superAdminUserId,
        createdAt: now,
      })
      .run();
  })();

  return { success: true };
}

export function listSystemAuditLogs(limit = 100) {
  const db = getSystemDb();
  return db
    .select({
      id: systemLogs.id,
      level: systemLogs.level,
      message: systemLogs.message,
      userId: systemLogs.userId,
      businessId: systemLogs.businessId,
      createdAt: systemLogs.createdAt,
    })
    .from(systemLogs)
    .orderBy(desc(systemLogs.createdAt))
    .limit(limit)
    .all();
}
