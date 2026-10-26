import type Database from "better-sqlite3";

/** Counts only: diagnostics must not disclose business/customer records. */
export function reconcileBusinessDatabase(sqlite: Database.Database) {
  const unbalanced = sqlite.prepare(`SELECT COUNT(*) AS count FROM (
    SELECT je.id FROM journal_entries je LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.status = 'posted' GROUP BY je.id
    HAVING COUNT(jl.id) < 2 OR COALESCE(SUM(jl.debit_minor),0) <> COALESCE(SUM(jl.credit_minor),0)
  )`).get() as { count: number };
  const payslips = sqlite.prepare(`SELECT COUNT(*) AS count FROM payslips p
    LEFT JOIN journal_entries je ON je.id = p.journal_entry_id
    WHERE p.document_status = 'posted' AND
      (je.id IS NULL OR je.status <> 'posted' OR je.source_type <> 'payslip' OR je.source_id <> p.id)`)
    .get() as { count: number };
  const totals = sqlite.prepare(`SELECT COUNT(*) AS count FROM payslips p WHERE
    p.gross_amount_minor <> COALESCE((SELECT SUM(l.amount_minor) FROM payslip_lines l WHERE l.payslip_id = p.id AND l.type = 'earnings'),0)
    OR p.deductions_minor <> COALESCE((SELECT SUM(l.amount_minor) FROM payslip_lines l WHERE l.payslip_id = p.id AND l.type = 'deduction'),0)
    OR p.net_amount_minor <> p.gross_amount_minor - p.deductions_minor`).get() as { count: number };
  let missingDocumentJournals = 0;
  for (const [table, source] of [
    ["sales_invoices", "sales_invoice"], ["purchase_invoices", "purchase_invoice"],
    ["sales_credit_notes", "sales_credit_note"], ["debit_notes", "debit_note"],
    ["receipts", "receipt"], ["supplier_payments", "supplier_payment"], ["bank_transactions", "bank_transaction"],
  ]) {
    const missing = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} d WHERE d.document_status = 'posted'
      AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = ? AND je.source_id = d.id AND je.status = 'posted')`)
      .get(source) as { count: number };
    missingDocumentJournals += missing.count;
  }
  const result = { unbalancedJournals: unbalanced.count, invalidPostedPayslips: payslips.count, invalidPayslipTotals: totals.count, missingDocumentJournals };
  if (Object.values(result).some(Boolean)) throw new Error(`Financial reconciliation failed: ${JSON.stringify(result)}`);
  return result;
}
