import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { mapCsvRows, parseCsv, statementFingerprint, type CsvMapping } from "./csv-import";

export function importBankStatement(
  businessId: string,
  userId: string,
  bankAccountId: string,
  fileName: string,
  csvText: string,
  mapping: CsvMapping,
) {
  if (!/\.csv$/i.test(fileName)) throw new Error("Choose a CSV statement file.");
  const table = parseCsv(csvText);
  const mapped = mapCsvRows(table, mapping);
  const context = getBusinessDb(businessId, userId);
  const bank = context.sqlite.prepare(`
    SELECT id, currency_code, is_cash_account, is_active FROM bank_accounts WHERE id = ?
  `).get(bankAccountId) as { id: string; currency_code: string; is_cash_account: number; is_active: number } | undefined;
  if (!bank || !bank.is_active) throw new Error("Bank Account not found or inactive.");
  if (bank.is_cash_account) throw new Error("Statement import is not available for Cash accounts.");
  if (bank.currency_code !== context.business.currency) throw new Error("Only base-currency statements are supported in Phase 5.");
  const importId = randomUUID();
  const now = new Date().toISOString();
  let importedCount = 0;
  let duplicateCount = 0;
  context.sqlite.transaction(() => {
    context.sqlite.prepare(`
      INSERT INTO bank_statement_imports (
        id, bank_account_id, file_name, row_count, imported_count, duplicate_count,
        mapping_json, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, 0, 0, ?, 'completed', ?, ?)
    `).run(importId, bankAccountId, fileName.slice(0, 255), mapped.rows.length,
      JSON.stringify(mapped.mapping), userId, now);
    const insert = context.sqlite.prepare(`
      INSERT OR IGNORE INTO bank_statement_lines (
        id, import_id, bank_account_id, transaction_date, value_date, description,
        reference, amount_minor, external_id, fingerprint, match_status,
        matched_source_type, matched_source_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched', NULL, NULL, ?)
    `);
    for (const row of mapped.rows) {
      const result = insert.run(randomUUID(), importId, bankAccountId, row.transactionDate,
        row.valueDate, row.description, row.reference, row.amountMinor, row.externalId,
        statementFingerprint(bankAccountId, row), now);
      if (result.changes === 1) importedCount += 1;
      else duplicateCount += 1;
    }
    context.sqlite.prepare(`
      UPDATE bank_statement_imports SET imported_count = ?, duplicate_count = ? WHERE id = ?
    `).run(importedCount, duplicateCount, importId);
  }).immediate();
  return { importId, rowCount: mapped.rows.length, importedCount, duplicateCount };
}

export function listStatementImports(businessId: string, userId: string, bankAccountId: string) {
  return getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT * FROM bank_statement_imports WHERE bank_account_id = ?
    ORDER BY created_at DESC
  `).all(bankAccountId) as {
    id: string; file_name: string; row_count: number; imported_count: number;
    duplicate_count: number; created_by: string; created_at: string;
  }[];
}

export type StatementLineRow = {
  id: string; import_id: string; bank_account_id: string; transaction_date: string;
  value_date: string | null; description: string; reference: string | null;
  amount_minor: number; external_id: string | null; match_status: "unmatched" | "matched" | "created" | "ignored";
  matched_source_type: string | null; matched_source_id: string | null; created_at: string;
  import_file_name: string; reconciled: number;
};

export function listStatementLines(
  businessId: string,
  userId: string,
  bankAccountId: string,
  status?: StatementLineRow["match_status"],
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT bsl.*, bsi.file_name AS import_file_name,
      CASE WHEN EXISTS (
        SELECT 1 FROM bank_reconciliation_items bri
        INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
        WHERE bri.statement_line_id = bsl.id
      ) THEN 1 ELSE 0 END AS reconciled
    FROM bank_statement_lines bsl
    INNER JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
    WHERE bsl.bank_account_id = ?${status ? " AND bsl.match_status = ?" : ""}
    ORDER BY bsl.transaction_date DESC, bsl.created_at DESC
  `).all(...(status ? [bankAccountId, status] : [bankAccountId])) as StatementLineRow[];
}

export function getStatementLine(businessId: string, userId: string, statementLineId: string) {
  return getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT bsl.*, ba.name AS bank_account_name FROM bank_statement_lines bsl
    INNER JOIN bank_accounts ba ON ba.id = bsl.bank_account_id WHERE bsl.id = ?
  `).get(statementLineId) as (StatementLineRow & { bank_account_name: string }) | undefined;
}
