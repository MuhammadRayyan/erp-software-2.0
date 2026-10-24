"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule, requirePermission } from "@/core/permissions/require-module";
import { accountInputSchema } from "./account-input";
import { invoiceNumberingInputSchema } from "./numbering-input";
import {
  createAccount,
  deleteAccount,
  updateAccount,
} from "./services/account-service";
import { updateInvoiceNumbering } from "./services/accounting-settings-service";
import { createTaxCode, updateTaxCode } from "./services/tax-code-service";
import { taxCodeInputSchema } from "./tax-code-input";

export type AccountingActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function saveAccountAction(
  businessId: string,
  accountId: string | null,
  input: unknown,
): Promise<AccountingActionResult> {
  const { user } = await requireModule(businessId, "accounting");
  const parsed = accountInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the account fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    if (accountId) updateAccount(businessId, user.id, accountId, parsed.data);
    else createAccount(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/accounting/chart-of-accounts`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The account could not be saved." };
  }
}

export async function deleteAccountAction(businessId: string, accountId: string) {
  const { user } = await requireModule(businessId, "accounting");
  try {
    deleteAccount(businessId, user.id, accountId);
    revalidatePath(`/b/${businessId}/accounting/chart-of-accounts`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The account could not be deleted." };
  }
}

export async function saveTaxCodeAction(
  businessId: string,
  taxCodeId: string | null,
  input: unknown,
): Promise<AccountingActionResult> {
  const { user } = await requireModule(businessId, "settings");
  const parsed = taxCodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the tax code fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    if (taxCodeId) updateTaxCode(businessId, user.id, taxCodeId, parsed.data);
    else createTaxCode(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/settings/tax-codes`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The tax code could not be saved." };
  }
}

export async function updateInvoiceNumberingAction(
  businessId: string,
  input: unknown,
): Promise<AccountingActionResult> {
  const { user } = await requireModule(businessId, "settings");
  const parsed = invoiceNumberingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the numbering fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    updateInvoiceNumbering(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/settings/numbering`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Numbering could not be updated." };
  }
}

export async function updateFinancialLockDateAction(
  businessId: string,
  lockDate: string | null,
): Promise<AccountingActionResult> {
  try {
    const { user } = await requirePermission(businessId, "accounting", "post");
    const { setFinancialLockDate } = await import("./services/financial-lock-service");
    setFinancialLockDate(businessId, user.id, lockDate);
    revalidatePath(`/b/${businessId}/settings/lock-date`);
    revalidatePath(`/b/${businessId}/settings`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Financial lock date could not be updated." };
  }
}

export async function saveOpeningBalancesAction(
  businessId: string,
  date: string,
  balances: { accountId: string; debitMinor: number; creditMinor: number }[],
): Promise<AccountingActionResult> {
  const { user } = await requireModule(businessId, "settings");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Please choose a valid opening balance date (YYYY-MM-DD)." };
  }
  try {
    const { saveOpeningBalances } = await import("./services/opening-balances-service");
    saveOpeningBalances(businessId, user.id, date, balances);
    revalidatePath(`/b/${businessId}/settings/opening-balances`);
    revalidatePath(`/b/${businessId}/accounting/chart-of-accounts`);
    revalidatePath(`/b/${businessId}/reports`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opening balances could not be saved." };
  }
}

export async function recodeLinesAction(
  businessId: string,
  payload: {
    lines: Array<{
      lineId: string;
      sourceType: "sales_invoice" | "purchase_invoice" | "bank_transaction" | "manual_journal";
      sourceId: string;
    }>;
    action:
      | { type: "account"; targetAccountId: string }
      | { type: "project"; targetProjectId: string | null }
      | { type: "taxCode"; targetTaxCodeId: string };
  },
): Promise<{ success?: boolean; message?: string; error?: string }> {
  const { user } = await requireModule(businessId, "accounting");
  try {
    const { recodeSelectedLines } = await import("./services/find-and-recode-service");
    const result = recodeSelectedLines(businessId, user.id, payload);
    revalidatePath(`/b/${businessId}/accounting/find-and-recode`);
    revalidatePath(`/b/${businessId}/accounting/journal`);
    revalidatePath(`/b/${businessId}/reports`);
    return { success: true, message: result.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Lines could not be recoded." };
  }
}
