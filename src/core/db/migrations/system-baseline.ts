import type Database from "better-sqlite3";
import { sqliteTableExists, validateSqliteSchema } from "./schema-validation";

const requiredTables = [
  "user", "session", "account", "verification", "businesses", "business_memberships",
] as const;

export function detectAndValidateSystemBaseline(sqlite: Database.Database) {
  const present = requiredTables.filter((table) => sqliteTableExists(sqlite, table));
  if (!present.length) return null;
  const issues = validateSqliteSchema(sqlite, {
    tables: {
      user: ["id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt"],
      session: ["id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"],
      account: ["id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "password", "createdAt", "updatedAt"],
      verification: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
      businesses: ["id", "name", "country", "currency", "financial_year_start_month", "directory_key", "archived", "created_at", "updated_at", "last_opened_at"],
      business_memberships: ["id", "business_id", "user_id", "role", "modules_json", "created_at"],
    },
    indexes: [
      "session_userId_idx", "account_userId_idx", "verification_identifier_idx",
      "membership_business_user_idx",
    ],
    foreignKeys: [
      { table: "session", from: "userId", toTable: "user", to: "id", onDelete: "CASCADE" },
      { table: "account", from: "userId", toTable: "user", to: "id", onDelete: "CASCADE" },
      { table: "business_memberships", from: "business_id", toTable: "businesses", to: "id", onDelete: "CASCADE" },
      { table: "business_memberships", from: "user_id", toTable: "user", to: "id", onDelete: "CASCADE" },
    ],
    uniqueColumns: [
      { table: "user", columns: ["email"] },
      { table: "session", columns: ["token"] },
      { table: "businesses", columns: ["directory_key"] },
      { table: "business_memberships", columns: ["business_id", "user_id"] },
    ],
    checkTables: ["business_memberships"],
  });
  if (issues.length) {
    throw new Error(
      `Cannot adopt legacy system schema baseline: ${issues.slice(0, 12).join("; ")}${issues.length > 12 ? `; and ${issues.length - 12} more issue(s)` : ""}.`,
    );
  }
  return 1;
}
