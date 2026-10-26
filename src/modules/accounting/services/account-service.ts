import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { accounts } from "@/core/db/business-schema";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { accountInputSchema, accountSubtypesByType, type AccountInput } from "../account-input";

function validateSubtype(data: ReturnType<typeof accountInputSchema.parse>) {
  if (!(accountSubtypesByType[data.type] as readonly string[]).includes(data.subtype)) {
    throw new Error("Choose a subtype that belongs to the selected account type.");
  }
}

export const listAccounts = cache((businessId: string, userId: string) => {
  return getBusinessDb(businessId, userId).db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.name))
    .all();
});

export function createAccount(businessId: string, userId: string, input: AccountInput) {
  assertMutationPermission(businessId, userId, "accounting", "create");
  const data = accountInputSchema.parse(input);
  validateSubtype(data);
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const id = randomUUID();
  context.db
    .insert(accounts)
    .values({ id, ...data, isSystem: false, createdAt: now, updatedAt: now })
    .run();

  try {
    recordActivity(businessId, {
      userId,
      action: "created",
      entityType: "account",
      entityId: id,
      entityNumber: data.name,
      summary: `Created ${data.type} account "${data.name}" (${data.subtype})`,
      details: { name: data.name, type: data.type, subtype: data.subtype },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] account create failed:", e);
  }
}

export function updateAccount(
  businessId: string,
  userId: string,
  accountId: string,
  input: AccountInput,
) {
  assertMutationPermission(businessId, userId, "accounting", "edit");
  const data = accountInputSchema.parse(input);
  validateSubtype(data);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!current) throw new Error("Account not found.");
  const next = current.isSystem
    ? { name: data.name, isActive: true }
    : data;
  context.db
    .update(accounts)
    .set({ ...next, updatedAt: new Date().toISOString() })
    .where(eq(accounts.id, accountId))
    .run();

  try {
    recordActivity(businessId, {
      userId,
      action: "updated",
      entityType: "account",
      entityId: accountId,
      entityNumber: data.name,
      summary: `Updated account "${data.name}"`,
      details: { name: data.name, type: data.type, subtype: data.subtype },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] account update failed:", e);
  }
}

export function deleteAccount(businessId: string, userId: string, accountId: string) {
  assertMutationPermission(businessId, userId, "accounting", "delete");
  const context = getBusinessDb(businessId, userId);
  let deletedAccountName = "";
  const run = context.sqlite.transaction(() => {
    const account = context.db.select().from(accounts).where(eq(accounts.id, accountId)).get();
    if (!account) throw new Error("Account not found.");
    if (account.isSystem) throw new Error("System accounts cannot be deleted.");
    deletedAccountName = account.name;

    const usageQueries = [
      "SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1",
      "SELECT 1 FROM sales_invoice_lines WHERE sales_account_id = ? LIMIT 1",
      "SELECT 1 FROM receipts WHERE bank_account_id = ? LIMIT 1",
      "SELECT 1 FROM tax_codes WHERE sales_tax_account_id = ? LIMIT 1",
      "SELECT 1 FROM tax_codes WHERE purchase_tax_account_id = ? LIMIT 1",
      "SELECT 1 FROM purchase_order_lines WHERE expense_account_id = ? LIMIT 1",
      "SELECT 1 FROM purchase_invoice_lines WHERE expense_account_id = ? LIMIT 1",
      "SELECT 1 FROM supplier_payments WHERE bank_account_id = ? LIMIT 1",
      "SELECT 1 FROM bank_accounts WHERE ledger_account_id = ? LIMIT 1",
      "SELECT 1 FROM bank_transaction_lines WHERE account_id = ? LIMIT 1",
      "SELECT 1 FROM sales_credit_note_lines WHERE sales_account_id = ? LIMIT 1",
      `SELECT 1 FROM inventory_items
         WHERE sales_account_id = ? OR inventory_asset_account_id = ?
            OR cost_of_sales_account_id = ? LIMIT 1`,
      `SELECT 1 FROM business_accounting_settings
         WHERE accounts_receivable_account_id = ? OR default_sales_account_id = ?
            OR default_bank_account_id = ? OR vat_output_account_id = ?
            OR accounts_payable_account_id = ? OR input_vat_account_id = ?
            OR default_purchase_expense_account_id = ? OR default_inventory_asset_account_id = ?
            OR default_cost_of_sales_account_id = ? OR inventory_adjustment_account_id = ? LIMIT 1`,
      "SELECT 1 FROM payslip_items WHERE account_id = ? LIMIT 1",
      "SELECT 1 FROM payslip_lines WHERE account_id = ? LIMIT 1",
    ];
    const used = usageQueries.some((query) => {
      const values = Array.from({ length: query.match(/\?/g)?.length ?? 0 }, () => accountId);
      return Boolean(context.sqlite.prepare(query).get(...values));
    });
    if (used) throw new Error("Cannot delete this account because it has transactions or is configured for accounting.");
    context.db.delete(accounts).where(eq(accounts.id, accountId)).run();
  });
  run.immediate();

  try {
    recordActivity(businessId, {
      userId,
      action: "deleted",
      entityType: "account",
      entityId: accountId,
      entityNumber: deletedAccountName,
      summary: `Deleted account "${deletedAccountName}"`,
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] account delete failed:", e);
  }
}

export function getSalesAccountOptions(businessId: string, userId: string) {
  return listAccounts(businessId, userId).filter(
    (account) => account.isActive && account.type === "income",
  );
}

export function getBankAccountOptions(businessId: string, userId: string) {
  return listAccounts(businessId, userId).filter(
    (account) => account.isActive && ["bank", "cash"].includes(account.subtype),
  );
}

export function getExpenseAccountOptions(businessId: string, userId: string) {
  return listAccounts(businessId, userId).filter(
    (account) => account.isActive && account.type === "expense",
  );
}

export function getAssetAccountOptions(businessId: string, userId: string) {
  return listAccounts(businessId, userId).filter(
    (account) => account.isActive && account.type === "asset",
  );
}

export function listAccountsWithBalances(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite
    .prepare(`
      SELECT a.id, a.name, a.type, a.subtype, a.is_system as isSystem, a.is_active as isActive,
             COALESCE(SUM(CASE WHEN je.status = 'posted' THEN jl.debit_minor ELSE 0 END), 0) as debit_total,
             COALESCE(SUM(CASE WHEN je.status = 'posted' THEN jl.credit_minor ELSE 0 END), 0) as credit_total
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      GROUP BY a.id
      ORDER BY a.name
    `)
    .all() as {
      id: string;
      name: string;
      type: "asset" | "liability" | "equity" | "income" | "expense";
      subtype: AccountInput["subtype"];
      isSystem: number;
      isActive: number;
      debit_total: number;
      credit_total: number;
    }[];

  return rows.map((r) => {
    const isDebitNormal = r.type === "asset" || r.type === "expense";
    const netBalanceMinor = isDebitNormal
      ? r.debit_total - r.credit_total
      : r.credit_total - r.debit_total;
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      subtype: r.subtype,
      isSystem: Boolean(r.isSystem),
      isActive: Boolean(r.isActive),
      balanceMinor: netBalanceMinor,
    };
  });
}

