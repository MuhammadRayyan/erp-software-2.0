import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getBusinessDb } from "@/core/db/business";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { addMinor } from "@/modules/accounting/calculations/money";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import { postTransaction, reverseTransaction, type JournalLineInput } from "@/modules/accounting/services/posting-service";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { calculateUaeEosb } from "./eosb-calculator";

/**
 * Monthly end-of-service gratuity (EOSB) accrual.
 *
 * For each employee the provision is topped up (or released) to the accrued
 * EOSB liability at month end, as computed by the statutory calculator:
 *   movement = liability at month end - provision already booked
 * where "booked" is every earlier posted accrual less the provision drawn down
 * by posted final-settlement payslips on or before month end. The month's run
 * posts one journal (Dr gratuity expense / Cr EOSB provision, per employee;
 * the reverse for releases). Running a month again replaces that month's
 * journal in place, so a month is never accrued twice. Inactive employees are
 * accrued to zero, which releases any provision left after their settlement.
 */

export const GRATUITY_EXPENSE_ACCOUNT_ID = "acct-gratuity-expense-6150";
export const GRATUITY_PROVISION_ACCOUNT_ID = "acct-eosb-provision-2250";
export const GRATUITY_PAYSLIP_ITEM_ID = "item-eosb-gratuity";
const SOURCE_TYPE = "gratuity_accrual";
const REVERSAL_SOURCE_TYPE = "gratuity_accrual_reversal";
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type GratuityAccrualLine = {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  isActive: boolean;
  joiningDate: string | null;
  basicSalaryMinor: number;
  /** Accrued EOSB liability at month end (0 when not yet eligible, inactive or not set up). */
  liabilityMinor: number;
  /** Provision booked before this month's run, after drawdowns up to month end. */
  openingProvisionMinor: number;
  /** Movement this run books: positive = expense / provision up, negative = release. */
  amountMinor: number;
  note: string | null;
};

export type GratuityAccrualPreview = {
  period: string;
  accrualDate: string;
  lines: GratuityAccrualLine[];
  totalAmountMinor: number;
  closingProvisionMinor: number;
  existing: { id: string; totalAmountMinor: number; journalEntryId: string | null; entryNumber: string | null } | null;
  /** A later month is already posted: this month cannot be posted or reversed until it is reversed. */
  laterPeriod: string | null;
  lockedReason: string | null;
};

export type GratuityAccrualRun = {
  id: string;
  period: string;
  accrualDate: string;
  status: "posted" | "reversed";
  totalAmountMinor: number;
  employeeCount: number;
  journalEntryId: string | null;
  entryNumber: string | null;
  createdAt: string;
  reversedAt: string | null;
};

export function monthEndOf(period: string) {
  const match = PERIOD.exec(period);
  if (!match) throw new Error("Choose a month in YYYY-MM format.");
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return `${period}-${String(lastDay).padStart(2, "0")}`;
}

function ensureAccount(
  sqlite: Database.Database,
  id: string,
  fallbackName: RegExp,
  type: "expense" | "liability",
  name: string,
  subtype: string,
) {
  const direct = sqlite.prepare("SELECT id FROM accounts WHERE id = ?").get(id) as { id: string } | undefined;
  if (direct) return direct.id;
  const candidates = sqlite.prepare(`
    SELECT id, name FROM accounts WHERE type = ? AND is_active = 1 ORDER BY is_system DESC, created_at ASC
  `).all(type) as { id: string; name: string }[];
  const byName = candidates.find((row) => fallbackName.test(row.name));
  if (byName) return byName.id;
  // Never fall back to an arbitrary account: create the dedicated one, as
  // Payroll Payable is created on first use.
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT OR IGNORE INTO accounts (id, name, type, subtype, is_system, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?)
  `).run(id, name, type, subtype, now, now);
  return id;
}

export function resolveGratuityAccounts(sqlite: Database.Database) {
  return {
    expenseAccountId: ensureAccount(
      sqlite, GRATUITY_EXPENSE_ACCOUNT_ID, /gratuity|end[\s-]of[\s-]service|eosb/i,
      "expense", "6150 - End of Service Gratuity Expense", "operating_expense",
    ),
    provisionAccountId: ensureAccount(
      sqlite, GRATUITY_PROVISION_ACCOUNT_ID, /gratuity|end[\s-]of[\s-]service|eosb/i,
      "liability", "2250 - End of Service Benefits Provision", "current_liability",
    ),
  };
}

/** Provision account if it already exists; reading never creates accounts. */
function existingProvisionAccountId(sqlite: Database.Database) {
  const direct = sqlite.prepare("SELECT id FROM accounts WHERE id = ?").get(GRATUITY_PROVISION_ACCOUNT_ID) as { id: string } | undefined;
  if (direct) return direct.id;
  const candidates = sqlite.prepare("SELECT id, name FROM accounts WHERE type = 'liability' AND is_active = 1 ORDER BY is_system DESC, created_at ASC").all() as { id: string; name: string }[];
  return candidates.find((row) => /gratuity|end[\s-]of[\s-]service|eosb/i.test(row.name))?.id ?? null;
}

/** Provision drawn down by posted payslips (debits to the provision account). */
function drawdownsByEmployee(
  sqlite: Database.Database,
  provisionAccountId: string | null,
  options: { throughDate?: string; employeeId?: string; excludePayslipId?: string } = {},
) {
  const result = new Map<string, number>();
  if (!provisionAccountId) return result;
  const rows = sqlite.prepare(`
    SELECT p.employee_id, COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS drawn
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND je.source_type = 'payslip'
    INNER JOIN payslips p ON p.id = je.source_id AND p.document_status = 'posted'
    WHERE jl.account_id = @account
      AND (@through IS NULL OR je.date <= @through)
      AND (@employee IS NULL OR p.employee_id = @employee)
      AND (@exclude IS NULL OR p.id <> @exclude)
    GROUP BY p.employee_id
  `).all({
    account: provisionAccountId,
    through: options.throughDate ?? null,
    employee: options.employeeId ?? null,
    exclude: options.excludePayslipId ?? null,
  }) as { employee_id: string; drawn: number }[];
  for (const row of rows) result.set(row.employee_id, row.drawn);
  return result;
}

function accruedByEmployee(sqlite: Database.Database, options: { beforePeriod?: string; employeeId?: string } = {}) {
  const rows = sqlite.prepare(`
    SELECT l.employee_id, COALESCE(SUM(l.amount_minor), 0) AS accrued
    FROM gratuity_accrual_lines l
    INNER JOIN gratuity_accruals a ON a.id = l.accrual_id AND a.status = 'posted'
    WHERE (@before IS NULL OR a.period < @before) AND (@employee IS NULL OR l.employee_id = @employee)
    GROUP BY l.employee_id
  `).all({ before: options.beforePeriod ?? null, employee: options.employeeId ?? null }) as { employee_id: string; accrued: number }[];
  return new Map(rows.map((row) => [row.employee_id, row.accrued]));
}

/**
 * Provision currently available to settle an employee's gratuity: every posted
 * accrual less earlier drawdowns. Used when a payslip pays gratuity.
 */
export function availableGratuityProvision(sqlite: Database.Database, employeeId: string, excludePayslipId?: string) {
  const provisionAccountId = existingProvisionAccountId(sqlite);
  if (!provisionAccountId) return { provisionAccountId: null, availableMinor: 0 };
  const accrued = accruedByEmployee(sqlite, { employeeId }).get(employeeId) ?? 0;
  const drawn = drawdownsByEmployee(sqlite, provisionAccountId, { employeeId, excludePayslipId }).get(employeeId) ?? 0;
  return { provisionAccountId, availableMinor: Math.max(0, accrued - drawn) };
}

/** Earnings lines that pay end-of-service gratuity (the seeded item or any item named "gratuity"). */
export function isGratuityPayslipItem(sqlite: Database.Database, itemId: string | null | undefined) {
  if (!itemId) return false;
  if (itemId === GRATUITY_PAYSLIP_ITEM_ID) return true;
  const row = sqlite.prepare("SELECT name FROM payslip_items WHERE id = ?").get(itemId) as { name: string } | undefined;
  return Boolean(row && /gratuity|end[\s-]of[\s-]service|eosb/i.test(row.name));
}

function computeLines(sqlite: Database.Database, period: string, accrualDate: string): GratuityAccrualLine[] {
  const employees = sqlite.prepare(`
    SELECT id, name, code, is_active, joining_date, basic_salary_minor FROM employees ORDER BY name, id
  `).all() as { id: string; name: string; code: string | null; is_active: number; joining_date: string | null; basic_salary_minor: number | null }[];
  const provisionAccountId = existingProvisionAccountId(sqlite);
  const accrued = accruedByEmployee(sqlite, { beforePeriod: period });
  const drawn = drawdownsByEmployee(sqlite, provisionAccountId, { throughDate: accrualDate });

  const lines: GratuityAccrualLine[] = [];
  for (const employee of employees) {
    const opening = (accrued.get(employee.id) ?? 0) - (drawn.get(employee.id) ?? 0);
    const basic = Number(employee.basic_salary_minor ?? 0);
    let liability = 0;
    let note: string | null = null;
    if (!employee.is_active) {
      note = "Inactive: provision released";
    } else if (!employee.joining_date) {
      note = "No joining date";
    } else if (employee.joining_date > accrualDate) {
      note = "Joins after month end";
    } else if (basic <= 0) {
      note = "No basic salary";
    } else {
      const eosb = calculateUaeEosb({ joiningDate: employee.joining_date, terminationDate: accrualDate, basicSalaryMinor: basic });
      liability = eosb.gratuityMinor;
      if (!eosb.eligibleForGratuity) note = "Under one year of service";
      else if (eosb.isCapped) note = "Capped at 24 months' basic salary";
    }
    const amount = liability - opening;
    // Employees with nothing booked and nothing to book are left out.
    if (liability === 0 && opening === 0) continue;
    lines.push({
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.code,
      isActive: Boolean(employee.is_active),
      joiningDate: employee.joining_date,
      basicSalaryMinor: basic,
      liabilityMinor: liability,
      openingProvisionMinor: opening,
      amountMinor: amount,
      note,
    });
  }
  return lines;
}

function postedRun(sqlite: Database.Database, period: string) {
  return sqlite.prepare(`
    SELECT a.id, a.total_amount_minor, a.journal_entry_id, je.entry_number
    FROM gratuity_accruals a LEFT JOIN journal_entries je ON je.id = a.journal_entry_id
    WHERE a.period = ? AND a.status = 'posted'
  `).get(period) as { id: string; total_amount_minor: number; journal_entry_id: string | null; entry_number: string | null } | undefined;
}

function laterPostedPeriod(sqlite: Database.Database, period: string) {
  const row = sqlite.prepare("SELECT MIN(period) AS period FROM gratuity_accruals WHERE status = 'posted' AND period > ?").get(period) as { period: string | null };
  return row.period;
}

function lockedReason(sqlite: Database.Database, date: string) {
  try {
    assertDateNotLocked(sqlite, date, "Gratuity accruals");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "The period is locked.";
  }
}

export function previewGratuityAccrual(businessId: string, userId: string, period: string): GratuityAccrualPreview {
  assertMutationPermission(businessId, userId, "payroll", "view");
  const { sqlite } = getBusinessDb(businessId, userId);
  const accrualDate = monthEndOf(period);
  const lines = computeLines(sqlite, period, accrualDate);
  const existing = postedRun(sqlite, period);
  return {
    period,
    accrualDate,
    lines,
    totalAmountMinor: addMinor(lines.map((line) => line.amountMinor)),
    closingProvisionMinor: addMinor(lines.map((line) => line.liabilityMinor)),
    existing: existing
      ? { id: existing.id, totalAmountMinor: existing.total_amount_minor, journalEntryId: existing.journal_entry_id, entryNumber: existing.entry_number }
      : null,
    laterPeriod: laterPostedPeriod(sqlite, period),
    lockedReason: lockedReason(sqlite, accrualDate),
  };
}

function buildJournalLines(lines: GratuityAccrualLine[], accounts: ReturnType<typeof resolveGratuityAccounts>, period: string): JournalLineInput[] {
  const journal: JournalLineInput[] = [];
  for (const line of lines) {
    if (line.amountMinor === 0) continue;
    const amount = Math.abs(line.amountMinor);
    const who = line.employeeCode ? `${line.employeeName} (${line.employeeCode})` : line.employeeName;
    if (line.amountMinor > 0) {
      journal.push({ accountId: accounts.expenseAccountId, description: `Gratuity accrual ${period}: ${who}`, debitMinor: amount, reference: period });
      journal.push({ accountId: accounts.provisionAccountId, description: `EOSB provision ${period}: ${who}`, creditMinor: amount, reference: period });
    } else {
      journal.push({ accountId: accounts.provisionAccountId, description: `EOSB provision released ${period}: ${who}`, debitMinor: amount, reference: period });
      journal.push({ accountId: accounts.expenseAccountId, description: `Gratuity accrual released ${period}: ${who}`, creditMinor: amount, reference: period });
    }
  }
  return journal;
}

function reverseRun(sqlite: Database.Database, run: { id: string; journal_entry_id: string | null }, period: string, accrualDate: string, userId: string) {
  let reversalId: string | null = null;
  if (run.journal_entry_id) {
    reversalId = reverseTransaction(sqlite, {
      originalSourceType: SOURCE_TYPE,
      originalSourceId: run.id,
      reversalSourceType: REVERSAL_SOURCE_TYPE,
      reversalSourceId: run.id,
      date: accrualDate,
      description: `Reverse gratuity accrual ${period}`,
    }).id;
  }
  const now = new Date().toISOString();
  sqlite.prepare(`
    UPDATE gratuity_accruals
    SET status = 'reversed', reversal_journal_entry_id = ?, reversed_by = ?, reversed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(reversalId, userId, now, now, run.id);
}

/**
 * Posts (or re-posts) the accrual for a month. Re-running a posted month
 * recalculates it and replaces its journal in place.
 */
export function postGratuityAccrual(businessId: string, userId: string, period: string) {
  assertMutationPermission(businessId, userId, "payroll", "post");
  const { sqlite } = getBusinessDb(businessId, userId);
  const accrualDate = monthEndOf(period);
  let result!: { id: string; totalAmountMinor: number; employeeCount: number; journalEntryId: string | null; replaced: boolean };

  sqlite.transaction(() => {
    assertDateNotLocked(sqlite, accrualDate, "Gratuity accruals");
    const later = laterPostedPeriod(sqlite, period);
    if (later) throw new Error(`The gratuity accrual for ${later} is already posted. Reverse later months before posting ${period}.`);

    const lines = computeLines(sqlite, period, accrualDate);
    const totalAmountMinor = addMinor(lines.map((line) => line.amountMinor));
    const existing = postedRun(sqlite, period);
    const now = new Date().toISOString();
    const movements = lines.filter((line) => line.amountMinor !== 0);

    let runId = existing?.id ?? randomUUID();
    let journalEntryId: string | null = null;
    if (movements.length > 0) {
      const accounts = resolveGratuityAccounts(sqlite);
      if (!existing) {
        sqlite.prepare(`
          INSERT INTO gratuity_accruals (id, period, accrual_date, status, total_amount_minor, created_by, created_at, updated_at)
          VALUES (?, ?, ?, 'posted', 0, ?, ?, ?)
        `).run(runId, period, accrualDate, userId, now, now);
      }
      journalEntryId = postTransaction(sqlite, {
        sourceType: SOURCE_TYPE,
        sourceId: runId,
        date: accrualDate,
        description: `End-of-service gratuity accrual ${period}`,
        lines: buildJournalLines(movements, accounts, period),
        replace: true,
      }).id;
    } else {
      // Nothing to book: an earlier run's journal for this month is reversed
      // rather than rewritten to zero, and the month is recorded as run.
      if (existing) {
        reverseRun(sqlite, existing, period, accrualDate, userId);
        runId = randomUUID();
      }
      sqlite.prepare(`
        INSERT INTO gratuity_accruals (id, period, accrual_date, status, total_amount_minor, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'posted', 0, ?, ?, ?)
      `).run(runId, period, accrualDate, userId, now, now);
    }

    sqlite.prepare(`
      UPDATE gratuity_accruals SET total_amount_minor = ?, journal_entry_id = ?, updated_at = ? WHERE id = ?
    `).run(totalAmountMinor, journalEntryId, now, runId);
    sqlite.prepare("DELETE FROM gratuity_accrual_lines WHERE accrual_id = ?").run(runId);
    const insertLine = sqlite.prepare(`
      INSERT INTO gratuity_accrual_lines (id, accrual_id, employee_id, liability_minor, opening_provision_minor, amount_minor)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertLine.run(randomUUID(), runId, line.employeeId, line.liabilityMinor, line.openingProvisionMinor, line.amountMinor);
    }

    recordActivity(businessId, {
      userId,
      action: existing ? "updated" : "posted",
      entityType: "gratuity_accrual",
      entityId: runId,
      entityNumber: period,
      summary: `${existing ? "Re-posted" : "Posted"} gratuity accrual for ${period}`,
      details: { period, accrualDate, totalAmountMinor, employees: lines.length },
      sqlite,
    });
    result = { id: runId, totalAmountMinor, employeeCount: lines.length, journalEntryId, replaced: Boolean(existing) };
  }).immediate();

  return result;
}

/** Reverses a month's posted accrual (dated the month end), allowing it to be re-run. */
export function reverseGratuityAccrual(businessId: string, userId: string, period: string) {
  assertMutationPermission(businessId, userId, "payroll", "delete");
  const { sqlite } = getBusinessDb(businessId, userId);
  const accrualDate = monthEndOf(period);
  sqlite.transaction(() => {
    const run = postedRun(sqlite, period);
    if (!run) throw new Error(`No posted gratuity accrual for ${period}.`);
    assertDateNotLocked(sqlite, accrualDate, "Gratuity accrual reversal");
    const later = laterPostedPeriod(sqlite, period);
    if (later) throw new Error(`The gratuity accrual for ${later} is posted. Reverse later months first.`);
    reverseRun(sqlite, run, period, accrualDate, userId);
    recordActivity(businessId, {
      userId,
      action: "voided",
      entityType: "gratuity_accrual",
      entityId: run.id,
      entityNumber: period,
      summary: `Reversed gratuity accrual for ${period}`,
      details: { period, totalAmountMinor: run.total_amount_minor },
      sqlite,
    });
  }).immediate();
}

export function listGratuityAccruals(businessId: string, userId: string, limit = 24): GratuityAccrualRun[] {
  assertMutationPermission(businessId, userId, "payroll", "view");
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT a.id, a.period, a.accrual_date, a.status, a.total_amount_minor, a.journal_entry_id, je.entry_number,
      a.created_at, a.reversed_at,
      (SELECT COUNT(*) FROM gratuity_accrual_lines l WHERE l.accrual_id = a.id) AS employee_count
    FROM gratuity_accruals a LEFT JOIN journal_entries je ON je.id = a.journal_entry_id
    ORDER BY a.period DESC, a.created_at DESC
    LIMIT ?
  `).all(limit) as {
    id: string; period: string; accrual_date: string; status: "posted" | "reversed"; total_amount_minor: number;
    journal_entry_id: string | null; entry_number: string | null; created_at: string; reversed_at: string | null; employee_count: number;
  }[];
  return rows.map((row) => ({
    id: row.id,
    period: row.period,
    accrualDate: row.accrual_date,
    status: row.status,
    totalAmountMinor: row.total_amount_minor,
    employeeCount: row.employee_count,
    journalEntryId: row.journal_entry_id,
    entryNumber: row.entry_number,
    createdAt: row.created_at,
    reversedAt: row.reversed_at,
  }));
}

/** Per-employee provision subledger (accruals less drawdowns); ties to the provision GL account. */
export function getGratuityProvisionBalances(businessId: string, userId: string) {
  assertMutationPermission(businessId, userId, "payroll", "view");
  const { sqlite } = getBusinessDb(businessId, userId);
  const provisionAccountId = existingProvisionAccountId(sqlite);
  const accrued = accruedByEmployee(sqlite);
  const drawn = drawdownsByEmployee(sqlite, provisionAccountId);
  const ids = new Set([...accrued.keys(), ...drawn.keys()]);
  const balances = [...ids].map((employeeId) => ({ employeeId, balanceMinor: (accrued.get(employeeId) ?? 0) - (drawn.get(employeeId) ?? 0) }));
  const gl = provisionAccountId
    ? (sqlite.prepare(`
        SELECT COALESCE(SUM(jl.credit_minor - jl.debit_minor), 0) AS balance
        FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
        WHERE jl.account_id = ?
      `).get(provisionAccountId) as { balance: number }).balance
    : 0;
  return { provisionAccountId, balances, subledgerMinor: addMinor(balances.map((row) => row.balanceMinor)), glMinor: gl };
}
