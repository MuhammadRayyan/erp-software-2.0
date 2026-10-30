import crypto from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getSystemSqlite } from "@/core/db/system";

export function getSystemUserCount(): number {
  try {
    const sqlite = getSystemSqlite();
    const row = sqlite.prepare("SELECT count(*) as count FROM user").get() as { count: number } | undefined;
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export function isSetupComplete(): boolean {
  return getSystemUserCount() > 0;
}

export function resolveSetupKey(): string {
  const envKey = process.env.SETUP_KEY?.trim();
  if (envKey) return envKey;
  if (process.env.NODE_ENV !== "production") {
    return "uae-manager-dev-setup-key";
  }
  throw new Error("SETUP_KEY environment variable is not configured on the production host.");
}

export function verifySetupKey(providedKey: string): boolean {
  try {
    const expected = resolveSetupKey();
    if (!providedKey || !expected) return false;
    const trimmed = providedKey.trim();
    if (process.env.NODE_ENV !== "production" && !process.env.SETUP_KEY?.trim()) {
      if (trimmed === "uae-manager-dev-setup-key" || trimmed === "ledgerly-dev-setup-key") {
        return true;
      }
    }
    const providedBuffer = Buffer.from(trimmed);
    const expectedBuffer = Buffer.from(expected.trim());
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export type CreateSuperAdminInput = {
  name: string;
  email: string;
  password: string;
  setupKey: string;
};

export async function createRootSuperAdmin(input: CreateSuperAdminInput) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const setupKey = input.setupKey.trim();

  // 1. Verify that setup is not already complete
  if (isSetupComplete()) {
    throw new Error("SETUP_ALREADY_COMPLETED: A super-admin account has already been initialized.");
  }

  // 2. Validate setup key
  if (!verifySetupKey(setupKey)) {
    throw new Error("INVALID_SETUP_KEY: The provided setup key does not match the server configuration.");
  }

  // 3. Validate credentials
  if (!name || name.length < 2) {
    throw new Error("INVALID_NAME: Name must be at least 2 characters long.");
  }
  if (!email || !email.includes("@") || email.length < 5) {
    throw new Error("INVALID_EMAIL: A valid email address is required.");
  }
  if (!password || password.length < 8) {
    throw new Error("WEAK_PASSWORD: Password must be at least 8 characters long.");
  }

  // 4. Hash password with better-auth standard hashing
  const hashedPassword = await hashPassword(password);

  const sqlite = getSystemSqlite();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = Date.now();

  // 5. Insert atomically inside a SQLite transaction with a strict re-check of count
  sqlite.transaction(() => {
    const check = sqlite.prepare("SELECT count(*) as count FROM user").get() as { count: number };
    if (check.count > 0) {
      throw new Error("SETUP_ALREADY_COMPLETED: A super-admin account has already been initialized.");
    }

    sqlite.prepare(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, is_super_admin)
      VALUES (?, ?, ?, 1, ?, ?, 1)
    `).run(userId, name, email, now, now);

    sqlite.prepare(`
      INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
      VALUES (?, ?, 'credential', ?, ?, ?, ?)
    `).run(accountId, userId, userId, hashedPassword, now, now);

    sqlite.prepare(`
      INSERT OR IGNORE INTO user_settings (user_id, theme_font, theme_size)
      VALUES (?, 'inter', 'normal')
    `).run(userId);
  })();

  return { userId, email, name };
}
