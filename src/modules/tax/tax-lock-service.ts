import type Database from "better-sqlite3";
import { categoryIsVatAffecting, type VatCategory } from "./uae-vat-config";

function lockDate(sqlite: Database.Database) {
  return (sqlite.prepare(
    "SELECT tax_lock_date FROM business_tax_settings WHERE id = 'default'",
  ).get() as { tax_lock_date: string | null } | undefined)?.tax_lock_date ?? null;
}

function lockedError(date: string) {
  return new Error(
    `This VAT period is finalized. Reopen the period before changing VAT-affecting transactions dated on or before ${date}.`,
  );
}

export function assertVatDateUnlocked(
  sqlite: Database.Database,
  taxDate: string,
  taxCodeIds: string[],
) {
  const lockedThrough = lockDate(sqlite);
  if (!lockedThrough || taxDate > lockedThrough || taxCodeIds.length === 0) return;
  const ids = [...new Set(taxCodeIds)];
  const rows = sqlite.prepare(`
    SELECT vat_category FROM tax_codes WHERE id IN (${ids.map(() => "?").join(", ")})
  `).all(...ids) as { vat_category: VatCategory | null }[];
  if (rows.some((row) => categoryIsVatAffecting(row.vat_category))) throw lockedError(lockedThrough);
}

export function assertVatSourceUnlocked(
  sqlite: Database.Database,
  sourceType: string,
  sourceId: string,
  fallbackTaxDate: string,
) {
  const lockedThrough = lockDate(sqlite);
  if (!lockedThrough) return;
  const entry = sqlite.prepare(`
    SELECT tax_date, vat_category FROM tax_entries
    WHERE source_type = ? AND source_id = ?
    ORDER BY tax_date LIMIT 1
  `).get(sourceType, sourceId) as { tax_date: string; vat_category: VatCategory } | undefined;
  const review = sqlite.prepare(`
    SELECT tax_date FROM vat_data_review
    WHERE source_type = ? AND source_id = ? AND status = 'open' LIMIT 1
  `).get(sourceType, sourceId) as { tax_date: string } | undefined;
  const taxDate = entry?.tax_date ?? review?.tax_date ?? fallbackTaxDate;
  const affectsVat = entry ? categoryIsVatAffecting(entry.vat_category) : Boolean(review);
  if (affectsVat && taxDate <= lockedThrough) throw lockedError(lockedThrough);
}
