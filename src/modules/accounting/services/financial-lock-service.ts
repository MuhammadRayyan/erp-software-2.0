import { getBusinessDb } from "@/core/db/business";
import type Database from "better-sqlite3";

export function getFinancialLockDate(businessId: string, userId: string): string | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT financial_lock_date FROM business_accounting_settings WHERE id = 'default'")
    .get() as { financial_lock_date?: string | null } | undefined;
  return row?.financial_lock_date ?? null;
}

export function setFinancialLockDate(businessId: string, userId: string, lockDate: string | null): void {
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite
    .prepare("UPDATE business_accounting_settings SET financial_lock_date = ?, updated_at = ? WHERE id = 'default'")
    .run(lockDate || null, now);
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
