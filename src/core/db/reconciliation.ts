import type Database from "better-sqlite3";

function getImportTimestamp(sqlite: Database.Database): string | null {
  try {
    const tableExists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='activity_logs'").get();
    if (!tableExists) return null;
    const row = sqlite.prepare(`
      SELECT created_at FROM activity_logs
      WHERE entity_type = 'business_profile'
        AND (
          details_json LIKE '%manager.io%' OR
          summary LIKE '%manager.io%'
        )
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as { created_at: string } | undefined;
    return row?.created_at ?? null;
  } catch {
    return null;
  }
}

/** Counts only: diagnostics must not disclose business/customer records. */
export function reconcileBusinessDatabase(sqlite: Database.Database) {
  const hasJournals = Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='journal_entries'").get()
  );
  const unbalancedCount = hasJournals
    ? (sqlite.prepare(`SELECT COUNT(*) AS count FROM (
        SELECT je.id FROM journal_entries je LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted' GROUP BY je.id
        HAVING COUNT(jl.id) < 2 OR COALESCE(SUM(jl.debit_minor),0) <> COALESCE(SUM(jl.credit_minor),0)
      )`).get() as { count: number }).count
    : 0;

  const importTimestamp = getImportTimestamp(sqlite);

  const hasPayslips = Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='payslips'").get()
  );

  let invalidPostedPayslips = 0;
  let invalidPayslipTotals = 0;

  if (hasPayslips) {
    const payslipsWhere = importTimestamp
      ? `WHERE p.document_status = 'posted' AND p.created_at > ? AND
         (je.id IS NULL OR je.status <> 'posted' OR je.source_type <> 'payslip' OR je.source_id <> p.id)`
      : `WHERE p.document_status = 'posted' AND
         (je.id IS NULL OR je.status <> 'posted' OR je.source_type <> 'payslip' OR je.source_id <> p.id)`;

    const payslips = (importTimestamp
      ? sqlite.prepare(`SELECT COUNT(*) AS count FROM payslips p
          LEFT JOIN journal_entries je ON je.id = p.journal_entry_id ${payslipsWhere}`).get(importTimestamp)
      : sqlite.prepare(`SELECT COUNT(*) AS count FROM payslips p
          LEFT JOIN journal_entries je ON je.id = p.journal_entry_id ${payslipsWhere}`).get()
    ) as { count: number };
    invalidPostedPayslips = payslips.count;

    const totalsWhere = importTimestamp
      ? `WHERE p.created_at > ? AND (
          p.gross_amount_minor <> COALESCE((SELECT SUM(l.amount_minor) FROM payslip_lines l WHERE l.payslip_id = p.id AND l.type = 'earnings'),0)
          OR p.deductions_minor <> COALESCE((SELECT SUM(l.amount_minor) FROM payslip_lines l WHERE l.payslip_id = p.id AND l.type = 'deduction'),0)
          OR p.net_amount_minor <> p.gross_amount_minor - p.deductions_minor)`
      : `WHERE
          p.gross_amount_minor <> COALESCE((SELECT SUM(l.amount_minor) FROM payslip_lines l WHERE l.payslip_id = p.id AND l.type = 'earnings'),0)
          OR p.deductions_minor <> COALESCE((SELECT SUM(l.amount_minor) FROM payslip_lines l WHERE l.payslip_id = p.id AND l.type = 'deduction'),0)
          OR p.net_amount_minor <> p.gross_amount_minor - p.deductions_minor`;

    const totals = (importTimestamp
      ? sqlite.prepare(`SELECT COUNT(*) AS count FROM payslips p ${totalsWhere}`).get(importTimestamp)
      : sqlite.prepare(`SELECT COUNT(*) AS count FROM payslips p ${totalsWhere}`).get()
    ) as { count: number };
    invalidPayslipTotals = totals.count;
  }

  let missingDocumentJournals = 0;
  for (const [table, source] of [
    ["sales_invoices", "sales_invoice"], ["purchase_invoices", "purchase_invoice"],
    ["sales_credit_notes", "sales_credit_note"], ["debit_notes", "debit_note"],
    ["receipts", "receipt"], ["supplier_payments", "supplier_payment"], ["bank_transactions", "bank_transaction"],
  ]) {
    const tableExists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!tableExists) continue;

    const missing = (importTimestamp
      ? sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} d WHERE d.document_status = 'posted' AND d.created_at > ?
          AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = ? AND je.source_id = d.id AND je.status = 'posted')`)
          .get(importTimestamp, source)
      : sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} d WHERE d.document_status = 'posted'
          AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = ? AND je.source_id = d.id AND je.status = 'posted')`)
          .get(source)
    ) as { count: number };
    missingDocumentJournals += missing.count;
  }

  const result = { unbalancedJournals: unbalancedCount, invalidPostedPayslips, invalidPayslipTotals, missingDocumentJournals };
  if (Object.values(result).some(Boolean)) throw new Error(`Financial reconciliation failed: ${JSON.stringify(result)}`);
  return result;
}
