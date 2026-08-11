"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
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
