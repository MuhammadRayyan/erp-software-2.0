import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { addMinor, minorToInput, parseMoneyToMinor, splitTaxInclusive } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { bankTransactionInputSchema, type BankTransactionInput, type BankTransactionIntent } from "./bank-transaction-input";
import { postBankTransaction } from "./bank-transaction-posting";
import { replaceTaxEntries, reverseTaxEntries } from "@/modules/tax/tax-entry-service";
import { assertVatDateUnlocked, assertVatSourceUnlocked } from "@/modules/tax/tax-lock-service";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];
type StoredLine = {
  id: string; accountId: string; taxCodeId: string; projectId: string | null;
  description: string; netAmountMinor: number; taxAmountMinor: number;
  grossAmountMinor: number; position: number;
};

function prepareLines(sqlite: Sqlite, data: ReturnType<typeof bankTransactionInputSchema.parse>, bankLedgerId: string) {
  const taxRows = sqlite.prepare(`
    SELECT id, rate_basis_points, direction, vat_category, is_recoverable,
      sales_tax_account_id, purchase_tax_account_id
    FROM tax_codes WHERE is_active = 1
  `).all() as { id: string; rate_basis_points: number; direction: string; vat_category: string | null; is_recoverable: number; sales_tax_account_id: string | null; purchase_tax_account_id: string | null }[];
  const taxById = new Map(taxRows.map((row) => [row.id, row]));
  const accountRows = sqlite.prepare("SELECT id, type, subtype FROM accounts WHERE is_active = 1").all() as { id: string; type: string; subtype: string }[];
  const accounts = new Map(accountRows.map((row) => [row.id, row]));
  const projects = new Set((sqlite.prepare("SELECT id FROM projects WHERE is_active = 1 AND status <> 'cancelled'").all() as { id: string }[]).map((row) => row.id));
  return data.lines.map((line, position): StoredLine => {
    const account = accounts.get(line.accountId);
    if (!account) throw new Error("A counter account is missing or inactive.");
    if (account.id === bankLedgerId || ["bank", "cash"].includes(account.subtype)) {
      throw new Error("Use Bank Transfer when moving money between Bank or Cash accounts.");
    }
    if (["accounts_receivable", "accounts_payable"].includes(account.subtype)) {
      throw new Error("Use a Customer Receipt or Supplier Payment for Accounts Receivable or Payable activity.");
    }
    if (line.projectId && !projects.has(line.projectId)) throw new Error("The selected Project is missing or cancelled.");
    const tax = taxById.get(line.taxCodeId);
    if (!tax) throw new Error("A selected tax code is missing or inactive.");
    const direction = data.type === "money_in" ? "sales" : "purchases";
    if (![direction, "both"].includes(tax.direction)) throw new Error(`The selected tax code cannot be used for ${direction}.`);
    if (!tax.vat_category) throw new Error("The selected tax code needs a VAT category before posting.");
    if (tax.vat_category === "reverse_charge") throw new Error("Use a Purchase Invoice for supported Reverse-Charge purchases.");
    if (tax.rate_basis_points > 0) {
      if (data.type === "money_out" && tax.is_recoverable && !tax.purchase_tax_account_id) {
        throw new Error("Input VAT account is not configured for the selected tax code.");
      }
      if (data.type === "money_in" && !tax.sales_tax_account_id) {
        throw new Error("Output VAT account is not configured for the selected tax code.");
      }
    }
    const grossAmountMinor = parseMoneyToMinor(line.amount);
    const split = splitTaxInclusive(grossAmountMinor, tax.rate_basis_points);
    return {
      id: randomUUID(), accountId: line.accountId, taxCodeId: line.taxCodeId,
      projectId: line.projectId || null, description: line.description,
      netAmountMinor: split.netMinor, taxAmountMinor: split.taxMinor,
      grossAmountMinor, position,
    };
  });
}

function validateStatementLine(
  sqlite: Sqlite,
  statementLineId: string,
  bankAccountId: string,
  type: "money_in" | "money_out",
  totalMinor: number,
  transactionId?: string,
) {
  const row = sqlite.prepare(`
    SELECT bsl.bank_account_id, bsl.amount_minor, bsl.match_status,
      bt.id AS reserved_transaction_id
    FROM bank_statement_lines bsl
    LEFT JOIN bank_transactions bt ON bt.statement_line_id = bsl.id
    WHERE bsl.id = ?
  `).get(statementLineId) as {
    bank_account_id: string; amount_minor: number; match_status: string;
    reserved_transaction_id: string | null;
  } | undefined;
  if (!row || row.bank_account_id !== bankAccountId) throw new Error("Statement line does not belong to this Bank Account.");
  if (row.match_status !== "unmatched") throw new Error("Statement line is no longer unmatched.");
  if (row.reserved_transaction_id && row.reserved_transaction_id !== transactionId) {
    throw new Error("Statement line is already attached to another draft transaction.");
  }
  const expected = type === "money_in" ? totalMinor : -totalMinor;
  if (row.amount_minor !== expected) throw new Error("Bank Transaction amount and direction must match the statement line.");
}

function insertLines(sqlite: Sqlite, transactionId: string, lines: StoredLine[]) {
  const insert = sqlite.prepare(`
    INSERT INTO bank_transaction_lines (
      id, bank_transaction_id, account_id, tax_code_id, project_id, description,
      net_amount_minor, tax_amount_minor, gross_amount_minor, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) insert.run(line.id, transactionId, line.accountId, line.taxCodeId,
    line.projectId, line.description, line.netAmountMinor, line.taxAmountMinor,
    line.grossAmountMinor, line.position);
}

export function saveBankTransaction(
  businessId: string,
  userId: string,
  input: BankTransactionInput,
  intent: BankTransactionIntent,
  transactionId?: string,
) {
  const data = bankTransactionInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const id = transactionId ?? randomUUID();
  const now = new Date().toISOString();
  const taxDate = data.taxDate || data.date;
  context.sqlite.transaction(() => {
    const bank = context.sqlite.prepare(`
      SELECT ba.id, ba.currency_code, ba.ledger_account_id, ba.is_active,
        a.is_active AS ledger_active
      FROM bank_accounts ba INNER JOIN accounts a ON a.id = ba.ledger_account_id
      WHERE ba.id = ?
    `).get(data.bankAccountId) as {
      id: string; currency_code: string; ledger_account_id: string; is_active: number; ledger_active: number;
    } | undefined;
    if (!bank || !bank.is_active || !bank.ledger_active) throw new Error("Choose an active Bank Account.");
    if (bank.currency_code !== context.business.currency) throw new Error("Only base-currency Bank Accounts are supported in Phase 5.");
    const current = transactionId ? context.sqlite.prepare(`
      SELECT transaction_number, document_status FROM bank_transactions WHERE id = ?
    `).get(transactionId) as { transaction_number: string; document_status: string } | undefined : undefined;
    if (transactionId && !current) throw new Error("Bank Transaction not found.");
    if (current && current.document_status !== "draft") throw new Error("Only draft Bank Transactions can be edited.");
    const lines = prepareLines(context.sqlite, data, bank.ledger_account_id);
    const totalMinor = addMinor(lines.map((line) => line.grossAmountMinor));
    if (intent === "post") assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
    if (data.statementLineId) validateStatementLine(context.sqlite, data.statementLineId,
      data.bankAccountId, data.type, totalMinor, transactionId);
    const transactionNumber = current?.transaction_number ?? allocateNumber(context.sqlite, "bankTransaction");
    if (current) {
      context.sqlite.prepare("DELETE FROM bank_transaction_lines WHERE bank_transaction_id = ?").run(id);
      context.sqlite.prepare(`
        UPDATE bank_transactions SET bank_account_id = ?, date = ?, tax_date = ?, supply_emirate = ?, type = ?, reference = ?,
          description = ?, total_minor = ?, statement_line_id = ?, document_status = ?,
          updated_at = ?, posted_at = ? WHERE id = ?
      `).run(data.bankAccountId, data.date, taxDate, data.supplyEmirate || null, data.type, data.reference || null, data.description,
        totalMinor, data.statementLineId || null, intent === "post" ? "posted" : "draft",
        now, intent === "post" ? now : null, id);
    } else {
      context.sqlite.prepare(`
        INSERT INTO bank_transactions (
          id, transaction_number, bank_account_id, date, tax_date, supply_emirate, type, reference, description,
          total_minor, statement_line_id, document_status, created_by, created_at,
          updated_at, posted_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(id, transactionNumber, data.bankAccountId, data.date, taxDate, data.supplyEmirate || null, data.type,
        data.reference || null, data.description, totalMinor, data.statementLineId || null,
        intent === "post" ? "posted" : "draft", userId, now, now,
        intent === "post" ? now : null);
    }
    insertLines(context.sqlite, id, lines);
    if (intent === "post") {
      postBankTransaction(context.sqlite, {
        id, transactionNumber, bankLedgerAccountId: bank.ledger_account_id,
        date: data.date, type: data.type, totalMinor, description: data.description,
      }, lines);
      replaceTaxEntries(context.sqlite, {
        sourceType: "bank_transaction", sourceId: id, sourceNumber: transactionNumber,
        taxDate, direction: data.type === "money_in" ? "sales" : "purchases",
        supplyEmirate: data.supplyEmirate || null,
      }, lines);
      if (data.statementLineId) context.sqlite.prepare(`
        UPDATE bank_statement_lines SET match_status = 'created',
          matched_source_type = 'bank_transaction', matched_source_id = ?
        WHERE id = ? AND match_status = 'unmatched'
      `).run(id, data.statementLineId);
    }
  }).immediate();
  return id;
}

export function getBankTransaction(businessId: string, userId: string, transactionId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const transaction = sqlite.prepare(`
    SELECT bt.*, ba.name AS bank_account_name, ba.ledger_account_id, a.code AS ledger_code,
      a.name AS ledger_name, bsl.match_status AS statement_status
    FROM bank_transactions bt
    INNER JOIN bank_accounts ba ON ba.id = bt.bank_account_id
    INNER JOIN accounts a ON a.id = ba.ledger_account_id
    LEFT JOIN bank_statement_lines bsl ON bsl.id = bt.statement_line_id
    WHERE bt.id = ?
  `).get(transactionId) as Record<string, unknown> | undefined;
  if (!transaction) return null;
  const lines = sqlite.prepare(`
    SELECT btl.*, a.code AS account_code, a.name AS account_name, tc.name AS tax_name,
      p.code AS project_code, p.name AS project_name
    FROM bank_transaction_lines btl
    INNER JOIN accounts a ON a.id = btl.account_id
    LEFT JOIN tax_codes tc ON tc.id = btl.tax_code_id
    LEFT JOIN projects p ON p.id = btl.project_id
    WHERE btl.bank_transaction_id = ? ORDER BY btl.position
  `).all(transactionId) as Record<string, unknown>[];
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date FROM journal_entries
    WHERE source_id = ? AND source_type IN ('bank_transaction', 'bank_transaction_void')
    ORDER BY CASE source_type WHEN 'bank_transaction' THEN 0 ELSE 1 END
  `).all(transactionId) as { id: string; entry_number: string; source_type: string; date: string }[];
  return { transaction, lines, journals };
}

export function bankTransactionToInput(record: NonNullable<ReturnType<typeof getBankTransaction>>): BankTransactionInput {
  const transaction = record.transaction;
  return {
    bankAccountId: String(transaction.bank_account_id),
    date: String(transaction.date),
    taxDate: String(transaction.tax_date),
    supplyEmirate: String(transaction.supply_emirate ?? "") as BankTransactionInput["supplyEmirate"],
    type: transaction.type as "money_in" | "money_out",
    reference: String(transaction.reference ?? ""),
    description: String(transaction.description),
    statementLineId: String(transaction.statement_line_id ?? ""),
    lines: record.lines.map((line) => ({
      accountId: String(line.account_id), taxCodeId: String(line.tax_code_id ?? ""),
      projectId: String(line.project_id ?? ""), description: String(line.description),
      amount: minorToInput(Number(line.gross_amount_minor)),
    })),
  };
}

export function voidBankTransaction(businessId: string, userId: string, transactionId: string) {
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    const transaction = context.sqlite.prepare(`
      SELECT transaction_number, document_status, statement_line_id
      FROM bank_transactions WHERE id = ?
    `).get(transactionId) as { transaction_number: string; document_status: string; statement_line_id: string | null } | undefined;
    if (!transaction) throw new Error("Bank Transaction not found.");
    if (transaction.document_status !== "posted") throw new Error("Only a posted Bank Transaction can be voided.");
    const taxDate = (context.sqlite.prepare("SELECT tax_date FROM bank_transactions WHERE id = ?").get(transactionId) as { tax_date: string }).tax_date;
    assertVatSourceUnlocked(context.sqlite, "bank_transaction", transactionId, taxDate);
    const matchedLines = context.sqlite.prepare(`
      SELECT id FROM bank_statement_lines
      WHERE matched_source_type = 'bank_transaction' AND matched_source_id = ?
    `).all(transactionId) as { id: string }[];
    for (const matchedLine of matchedLines) {
      const reconciled = context.sqlite.prepare(`
        SELECT 1 FROM bank_reconciliation_items bri
        INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
        WHERE bri.statement_line_id = ?
      `).get(matchedLine.id);
      if (reconciled) throw new Error("Cannot void a Bank Transaction included in a completed reconciliation.");
    }
    reverseTransaction(context.sqlite, {
      originalSourceType: "bank_transaction", originalSourceId: transactionId,
      reversalSourceType: "bank_transaction_void", reversalSourceId: transactionId,
      date: now.slice(0, 10), description: `Reverse Bank Transaction ${transaction.transaction_number}`,
    });
    reverseTaxEntries(context.sqlite, { originalSourceType: "bank_transaction", sourceId: transactionId, reversalSourceType: "bank_transaction_void", taxDate });
    context.sqlite.prepare("UPDATE bank_transactions SET document_status = 'void', statement_line_id = NULL, voided_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, transactionId);
    if (matchedLines.length) context.sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'unmatched', matched_source_type = NULL,
        matched_source_id = NULL WHERE matched_source_type = 'bank_transaction'
          AND matched_source_id = ?
    `).run(transactionId);
  }).immediate();
}
