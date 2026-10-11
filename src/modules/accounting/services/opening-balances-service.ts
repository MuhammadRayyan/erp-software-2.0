import { getBusinessDb } from "@/core/db/business";
import { randomUUID } from "node:crypto";
import { listAccounts } from "./account-service";

export type OpeningBalanceLine = {
  accountId: string;
  name: string;
  type: string;
  subtype: string;
  debitMinor: number;
  creditMinor: number;
};

export type OpeningBalancesData = {
  openingDate: string | null;
  accounts: OpeningBalanceLine[];
  totalDebitsMinor: number;
  totalCreditsMinor: number;
  differenceMinor: number;
};

export function getOpeningBalances(businessId: string, userId: string): OpeningBalancesData {
  const { sqlite } = getBusinessDb(businessId, userId);
  const settings = sqlite
    .prepare("SELECT opening_balances_date FROM business_accounting_settings WHERE id = 'default'")
    .get() as { opening_balances_date?: string | null } | undefined;

  const openingDate = settings?.opening_balances_date ?? null;

  // Find existing opening balance journal entry
  const entry = sqlite
    .prepare("SELECT id, date FROM journal_entries WHERE source_type = 'opening_balance' AND source_id = 'default'")
    .get() as { id: string; date: string } | undefined;

  const existingLines = new Map<string, { debitMinor: number; creditMinor: number }>();
  if (entry) {
    const lines = sqlite
      .prepare("SELECT account_id, debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?")
      .all(entry.id) as { account_id: string; debit_minor: number; credit_minor: number }[];
    for (const l of lines) {
      existingLines.set(l.account_id, {
        debitMinor: l.debit_minor,
        creditMinor: l.credit_minor,
      });
    }
  }

  const allAccounts = listAccounts(businessId, userId).filter((a) => a.isActive);
  let totalDebits = 0;
  let totalCredits = 0;

  const accountRows: OpeningBalanceLine[] = allAccounts.map((a) => {
    const existing = existingLines.get(a.id) ?? { debitMinor: 0, creditMinor: 0 };
    totalDebits += existing.debitMinor;
    totalCredits += existing.creditMinor;
    return {
      accountId: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      debitMinor: existing.debitMinor,
      creditMinor: existing.creditMinor,
    };
  });

  return {
    openingDate: openingDate ?? entry?.date ?? null,
    accounts: accountRows,
    totalDebitsMinor: totalDebits,
    totalCreditsMinor: totalCredits,
    differenceMinor: totalDebits - totalCredits,
  };
}

export function saveOpeningBalances(
  businessId: string,
  userId: string,
  date: string,
  balances: { accountId: string; debitMinor: number; creditMinor: number }[],
): void {
  const { sqlite } = getBusinessDb(businessId, userId);

  sqlite.transaction(() => {
    const now = new Date().toISOString();
    sqlite
      .prepare("UPDATE business_accounting_settings SET opening_balances_date = ?, updated_at = ? WHERE id = 'default'")
      .run(date, now);

    // Existing journal entry
    const existing = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'opening_balance' AND source_id = 'default'")
      .get() as { id: string } | undefined;

    const activeLines = balances.filter((b) => (b.debitMinor ?? 0) > 0 || (b.creditMinor ?? 0) > 0);

    // Calculate totals
    const totalDebit = activeLines.reduce((sum, l) => sum + (l.debitMinor || 0), 0);
    const totalCredit = activeLines.reduce((sum, l) => sum + (l.creditMinor || 0), 0);
    const diff = totalDebit - totalCredit;

    // Auto-balance into Retained Earnings or Owner Equity if out of balance
    const finalLines = [...activeLines];
    if (diff !== 0) {
      const equityAccount = sqlite
        .prepare("SELECT id FROM accounts WHERE type = 'equity' AND is_active = 1 ORDER BY id LIMIT 1")
        .get() as { id: string } | undefined;
      if (equityAccount) {
        if (diff > 0) {
          // Credits needed
          finalLines.push({ accountId: equityAccount.id, debitMinor: 0, creditMinor: diff });
        } else {
          // Debits needed
          finalLines.push({ accountId: equityAccount.id, debitMinor: -diff, creditMinor: 0 });
        }
      }
    }

    if (finalLines.length === 0) {
      if (existing) {
        sqlite.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").run(existing.id);
        sqlite.prepare("DELETE FROM journal_entries WHERE id = ?").run(existing.id);
      }
      return;
    }

    const journalId = existing?.id ?? randomUUID();
    if (existing) {
      sqlite.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").run(journalId);
      sqlite
        .prepare("UPDATE journal_entries SET date = ?, description = ?, posted_at = ? WHERE id = ?")
        .run(date, `Opening Balances as of ${date}`, now, journalId);
    } else {
      sqlite
        .prepare(`
          INSERT INTO journal_entries (id, entry_number, date, source_type, source_id, description, status, created_at, posted_at)
          VALUES (?, 'OPENING-BALANCES', ?, 'opening_balance', 'default', ?, 'posted', ?, ?)
        `)
        .run(journalId, date, `Opening Balances as of ${date}`, now, now);
    }

    const insertLine = sqlite.prepare(`
      INSERT INTO journal_lines (id, journal_entry_id, account_id, description, debit_minor, credit_minor, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    finalLines.forEach((line, index) => {
      insertLine.run(
        randomUUID(),
        journalId,
        line.accountId,
        `Opening balance as of ${date}`,
        line.debitMinor ?? 0,
        line.creditMinor ?? 0,
        index,
      );
    });
  })();
}
