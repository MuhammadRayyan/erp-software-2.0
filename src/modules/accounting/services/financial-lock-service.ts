import { assertBusinessAdministrator } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import type Database from "better-sqlite3";
import { recordActivity } from "@/modules/activity-log/activity-log-service";

export function getFinancialLockDate(businessId: string, userId: string): string | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT financial_lock_date FROM business_accounting_settings WHERE id = 'default'")
    .get() as { financial_lock_date?: string | null } | undefined;
  return row?.financial_lock_date ?? null;
}

export function setFinancialLockDate(businessId: string, userId: string, lockDate: string | null): void {
  assertBusinessAdministrator(businessId, userId);
  const normalized = lockDate?.trim() || null;
  if (normalized) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new Error("Financial lock date must be in YYYY-MM-DD format.");
    }
    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
      throw new Error("Financial lock date is not a valid calendar date.");
    }
  }
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite
    .prepare("UPDATE business_accounting_settings SET financial_lock_date = ?, updated_at = ? WHERE id = 'default'")
    .run(normalized, now);

  recordActivity(businessId, {
    userId,
    action: "settings_changed",
    entityType: "financial_lock",
    entityId: "default",
    entityNumber: normalized ?? "Unlocked",
    summary: normalized ? `Updated financial lock date to ${normalized}` : "Removed financial lock date",
    details: { financialLockDate: normalized },
  });
}

export function assertFinancialLock(sqlite: Database.Database, date: string, actionDesc = "Transactions"): void {
  try {
    const row = sqlite
      .prepare("SELECT financial_lock_date FROM business_accounting_settings WHERE id = 'default'")
      .get() as { financial_lock_date?: string | null } | undefined;
    if (row?.financial_lock_date && date <= row.financial_lock_date) {
      throw new Error(
        `The financial period on or before ${row.financial_lock_date} is closed. ${actionDesc} cannot be created, posted, or modified.`,
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("closed")) {
      throw err;
    }
    // Only tolerate missing column or table from baseline migrations before migration 27
    if (err instanceof Error && (err.message.includes("no such column") || err.message.includes("no such table"))) {
      return;
    }
    throw err;
  }
}

export const assertDateNotLocked = assertFinancialLock;

