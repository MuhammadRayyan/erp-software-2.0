import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { accounts } from "@/core/db/business-schema";
import { accountInputSchema, accountSubtypesByType, type AccountInput } from "../account-input";

function validateSubtype(data: ReturnType<typeof accountInputSchema.parse>) {
  if (!(accountSubtypesByType[data.type] as readonly string[]).includes(data.subtype)) {
    throw new Error("Choose a subtype that belongs to the selected account type.");
  }
}

export function listAccounts(businessId: string, userId: string) {
  return getBusinessDb(businessId, userId).db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.code))
    .all();
}

export function createAccount(businessId: string, userId: string, input: AccountInput) {
  const data = accountInputSchema.parse(input);
  validateSubtype(data);
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  try {
    context.db
      .insert(accounts)
      .values({ id: randomUUID(), ...data, isSystem: false, createdAt: now, updatedAt: now })
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("An account with this code already exists.");
    }
    throw error;
  }
}

export function updateAccount(
  businessId: string,
  userId: string,
  accountId: string,
  input: AccountInput,
) {
  const data = accountInputSchema.parse(input);
  validateSubtype(data);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!current) throw new Error("Account not found.");
  const next = current.isSystem
    ? { code: data.code, name: data.name, isActive: true }
    : data;
  try {
    context.db
      .update(accounts)
      .set({ ...next, updatedAt: new Date().toISOString() })
      .where(eq(accounts.id, accountId))
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("An account with this code already exists.");
    }
    throw error;
  }
}

export function deleteAccount(businessId: string, userId: string, accountId: string) {
  const context = getBusinessDb(businessId, userId);
  const account = context.db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) throw new Error("Account not found.");
  if (account.isSystem) throw new Error("System accounts cannot be deleted.");

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
  ];
  const used = usageQueries.some((query) => {
    const values = Array.from({ length: query.match(/\?/g)?.length ?? 0 }, () => accountId);
    return Boolean(context.sqlite.prepare(query).get(...values));
  });
  if (used) throw new Error("Cannot delete this account because it has transactions or is configured for accounting.");
  context.db.delete(accounts).where(eq(accounts.id, accountId)).run();
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
