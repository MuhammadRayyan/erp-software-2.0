import { getBusinessDb } from "@/core/db/business";
import { getVatWorkingPaper } from "@/modules/tax/vat-report-service";

export type NextVatReturn = {
  periodId: string;
  periodReference: string;
  filingDueDate: string;
  netVatMinor: number;
  daysUntilDue: number;
};

/** The earliest-due VAT period that has not been finalized or filed. */
export function getNextVatReturn(businessId: string, userId: string, today: string): NextVatReturn | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const period = sqlite.prepare(`
    SELECT id, period_reference, filing_due_date FROM vat_periods
    WHERE status IN ('open', 'reopened', 'prepared')
    ORDER BY filing_due_date ASC LIMIT 1
  `).get() as { id: string; period_reference: string; filing_due_date: string } | undefined;
  if (!period) return null;
  const paper = getVatWorkingPaper(businessId, userId, period.id);
  return {
    periodId: period.id,
    periodReference: period.period_reference,
    filingDueDate: period.filing_due_date,
    netVatMinor: paper.netVatMinor,
    daysUntilDue: Math.round((Date.parse(`${period.filing_due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
  };
}

/** Imported bank statement lines still waiting to be matched, across all bank accounts. */
export function getUnreconciledStatementSummary(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT bsl.bank_account_id AS bankAccountId, COUNT(*) AS count
    FROM bank_statement_lines bsl
    INNER JOIN bank_accounts ba ON ba.id = bsl.bank_account_id AND ba.is_active = 1
    WHERE bsl.match_status = 'unmatched'
    GROUP BY bsl.bank_account_id
    ORDER BY count DESC
  `).all() as { bankAccountId: string; count: number }[];
  return {
    count: rows.reduce((sum, row) => sum + row.count, 0),
    /** The account with the most work, so the card can deep-link to it. */
    busiestAccountId: rows[0]?.bankAccountId ?? null,
  };
}
