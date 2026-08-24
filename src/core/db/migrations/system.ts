import type { SqliteMigration } from "./runner";

export const systemMigrations = [
  {
    version: 1,
    name: "phase_0_system_schema",
    up(sqlite) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS "user" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "name" TEXT NOT NULL,
          "email" TEXT NOT NULL UNIQUE,
          "emailVerified" INTEGER NOT NULL DEFAULT 0,
          "image" TEXT,
          "createdAt" INTEGER NOT NULL,
          "updatedAt" INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "session" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "expiresAt" INTEGER NOT NULL,
          "token" TEXT NOT NULL UNIQUE,
          "createdAt" INTEGER NOT NULL,
          "updatedAt" INTEGER NOT NULL,
          "ipAddress" TEXT,
          "userAgent" TEXT,
          "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
        CREATE TABLE IF NOT EXISTS "account" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "accountId" TEXT NOT NULL,
          "providerId" TEXT NOT NULL,
          "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "accessToken" TEXT,
          "refreshToken" TEXT,
          "idToken" TEXT,
          "accessTokenExpiresAt" INTEGER,
          "refreshTokenExpiresAt" INTEGER,
          "scope" TEXT,
          "password" TEXT,
          "createdAt" INTEGER NOT NULL,
          "updatedAt" INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
        CREATE TABLE IF NOT EXISTS "verification" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "identifier" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "expiresAt" INTEGER NOT NULL,
          "createdAt" INTEGER,
          "updatedAt" INTEGER
        );
        CREATE INDEX IF NOT EXISTS "verification_identifier_idx"
          ON "verification" ("identifier");
        CREATE TABLE IF NOT EXISTS "businesses" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "name" TEXT NOT NULL,
          "country" TEXT NOT NULL,
          "currency" TEXT NOT NULL,
          "financial_year_start_month" INTEGER NOT NULL,
          "directory_key" TEXT NOT NULL UNIQUE,
          "archived" INTEGER NOT NULL DEFAULT 0,
          "created_at" TEXT NOT NULL,
          "updated_at" TEXT NOT NULL,
          "last_opened_at" TEXT
        );
        CREATE TABLE IF NOT EXISTS "business_memberships" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
          "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "role" TEXT NOT NULL CHECK ("role" IN ('administrator', 'standard')),
          "modules_json" TEXT NOT NULL,
          "created_at" TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "membership_business_user_idx"
          ON "business_memberships" ("business_id", "user_id");
      `);
    },
  },
  {
    version: 2,
    name: "phase_1_user_settings",
    up(sqlite) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS "user_settings" (
          "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "theme_font" TEXT NOT NULL DEFAULT 'inter',
          "theme_size" TEXT NOT NULL DEFAULT 'normal'
        );
      `);
    },
  },
  {
    version: 3,
    name: "review_4_user_business_preferences",
    up(sqlite) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS "user_business_preferences" (
          "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "updated_at" INTEGER NOT NULL,
          PRIMARY KEY ("user_id", "business_id", "key")
        );
        CREATE INDEX IF NOT EXISTS "user_business_pref_business_idx"
          ON "user_business_preferences" ("business_id");
      `);
    },
  },
] satisfies readonly SqliteMigration[];
