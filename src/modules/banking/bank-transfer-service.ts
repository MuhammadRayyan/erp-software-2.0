import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { parseMoneyToMinor } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postTransaction, reverseTransaction } from "@/modules/accounting/services/posting-service";
import { bankTransferInputSchema, type BankTransferInput } from "./bank-transfer-input";

export function createBankTransfer(businessId: string, userId: string, input: BankTransferInput) {
  const data = bankTransferInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const amountMinor = parseMoneyToMinor(data.amount);
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    const accounts = context.sqlite.prepare(`
      SELECT ba.id, ba.currency_code, ba.ledger_account_id, ba.is_active, a.is_active AS ledger_active
      FROM bank_accounts ba INNER JOIN accounts a ON a.id = ba.ledger_account_id
      WHERE ba.id IN (?, ?)
    `).all(data.fromBankAccountId, data.toBankAccountId) as {
      id: string; currency_code: string; ledger_account_id: string; is_active: number; ledger_active: number;
    }[];
    if (accounts.length !== 2 || accounts.some((account) => !account.is_active || !account.ledger_active)) {
      throw new Error("Choose two active Bank or Cash accounts.");
    }
    if (accounts.some((account) => account.currency_code !== context.business.currency)) {
      throw new Error("Only base-currency Bank Transfers are supported in Phase 5.");
    }
    const source = accounts.find((account) => account.id === data.fromBankAccountId)!;
    const destination = accounts.find((account) => account.id === data.toBankAccountId)!;
    const transferNumber = allocateNumber(context.sqlite, "bankTransfer");
    context.sqlite.prepare(`
      INSERT INTO bank_transfers (
        id, transfer_number, from_bank_account_id, to_bank_account_id, date,
        amount_minor, reference, description, document_status, created_by,
        created_at, posted_at, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL)
    `).run(id, transferNumber, data.fromBankAccountId, data.toBankAccountId, data.date,
      amountMinor, data.reference || null, data.description || null, userId, now, now);
    postTransaction(context.sqlite, {
      sourceType: "bank_transfer", sourceId: id, date: data.date,
      description: `Bank Transfer ${transferNumber}`,
      lines: [
        { accountId: destination.ledger_account_id, description: data.description || `Transfer from ${transferNumber}`, debitMinor: amountMinor, reference: transferNumber },
        { accountId: source.ledger_account_id, description: data.description || `Transfer to ${transferNumber}`, creditMinor: amountMinor, reference: transferNumber },
      ],
    });
  }).immediate();
  return id;
}

export function getBankTransfer(businessId: string, userId: string, transferId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const transfer = sqlite.prepare(`
    SELECT bt.*, source.name AS from_account_name, destination.name AS to_account_name
    FROM bank_transfers bt
    INNER JOIN bank_accounts source ON source.id = bt.from_bank_account_id
    INNER JOIN bank_accounts destination ON destination.id = bt.to_bank_account_id
    WHERE bt.id = ?
  `).get(transferId) as Record<string, unknown> | undefined;
  if (!transfer) return null;
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date FROM journal_entries
    WHERE source_id = ? AND source_type IN ('bank_transfer', 'bank_transfer_void')
    ORDER BY CASE source_type WHEN 'bank_transfer' THEN 0 ELSE 1 END
  `).all(transferId) as { id: string; entry_number: string; source_type: string; date: string }[];
  return { transfer, journals };
}

export function voidBankTransfer(businessId: string, userId: string, transferId: string) {
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    const transfer = context.sqlite.prepare(`
      SELECT transfer_number, document_status FROM bank_transfers WHERE id = ?
    `).get(transferId) as { transfer_number: string; document_status: string } | undefined;
    if (!transfer) throw new Error("Bank Transfer not found.");
    if (transfer.document_status !== "posted") throw new Error("Only a posted Bank Transfer can be voided.");
    const reconciled = context.sqlite.prepare(`
      SELECT 1 FROM bank_statement_lines bsl
      INNER JOIN bank_reconciliation_items bri ON bri.statement_line_id = bsl.id
      INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
      WHERE bsl.matched_source_type = 'bank_transfer' AND bsl.matched_source_id = ? LIMIT 1
    `).get(transferId);
    if (reconciled) throw new Error("Cannot void a Bank Transfer included in a completed reconciliation.");
    reverseTransaction(context.sqlite, {
      originalSourceType: "bank_transfer", originalSourceId: transferId,
      reversalSourceType: "bank_transfer_void", reversalSourceId: transferId,
      date: now.slice(0, 10), description: `Reverse Bank Transfer ${transfer.transfer_number}`,
    });
    context.sqlite.prepare("UPDATE bank_transfers SET document_status = 'void', voided_at = ? WHERE id = ?")
      .run(now, transferId);
    context.sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'unmatched', matched_source_type = NULL,
        matched_source_id = NULL WHERE matched_source_type = 'bank_transfer' AND matched_source_id = ?
    `).run(transferId);
  }).immediate();
}
