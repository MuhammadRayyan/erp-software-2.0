"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { bankAccountInputSchema } from "./bank-account-input";
import { saveBankAccount } from "./bank-account-service";
import { bankTransactionInputSchema } from "./bank-transaction-input";
import { saveBankTransaction, voidBankTransaction } from "./bank-transaction-service";
import { bankTransferInputSchema } from "./bank-transfer-input";
import { createBankTransfer, voidBankTransfer } from "./bank-transfer-service";
import { csvMappingSchema } from "./csv-import";
import { confirmStatementMatch, ignoreStatementLine, resetStatementLine } from "./matching-service";
import type { MatchSourceType } from "./matching-types";
import { completeReconciliation, startReconciliation } from "./reconciliation-service";
import { reconciliationInputSchema } from "./reconciliation-input";
import { importBankStatement } from "./statement-service";
import {
  bankRuleInputSchema,
  createBankRule,
  updateBankRule,
  deleteBankRule,
  toggleBankRuleActive,
  applyBankRule,
  batchApplyBankRules,
} from "./bank-rule-service";

export type BankingActionResult = { error?: string; fieldErrors?: Record<string, string[]> };
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

export async function saveBankAccountAction(
  businessId: string, bankAccountId: string | null, input: unknown,
): Promise<BankingActionResult> {
  const { user } = await requireSavePermission(businessId, "banking", bankAccountId, "draft");
  const parsed = bankAccountInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the Bank Account fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveBankAccount(businessId, user.id, parsed.data, bankAccountId ?? undefined); }
  catch (error) { return { error: message(error, "The Bank Account could not be saved.") }; }
  redirect(`/b/${businessId}/banking/accounts/${id}?notice=${bankAccountId ? "Bank Account updated" : "Bank Account created"}`);
}

export async function saveBankTransactionAction(
  businessId: string, transactionId: string | null, intent: "draft" | "post", input: unknown,
): Promise<BankingActionResult> {
  const { user } = await requireSavePermission(businessId, "banking", transactionId, intent);
  const parsed = bankTransactionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the Bank Transaction fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  let id: string;
  try { id = saveBankTransaction(businessId, user.id, parsed.data, intent, transactionId ?? undefined); }
  catch (error) { return { error: message(error, "The Bank Transaction could not be saved.") }; }
  redirect(`/b/${businessId}/banking/transactions/${id}?notice=${intent === "post" ? "Bank Transaction posted" : "Draft saved"}`);
}

export async function voidBankTransactionAction(businessId: string, transactionId: string) {
  const { user } = await requirePermission(businessId, "banking", "delete");
  try {
    voidBankTransaction(businessId, user.id, transactionId);
    revalidatePath(`/b/${businessId}/banking`);
    return {};
  } catch (error) { return { error: message(error, "The Bank Transaction could not be voided.") }; }
}

export async function createBankTransferAction(businessId: string, input: unknown): Promise<BankingActionResult> {
  const { user } = await requirePermission(businessId, "banking", "create");
  const parsed = bankTransferInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the transfer fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = createBankTransfer(businessId, user.id, parsed.data); }
  catch (error) { return { error: message(error, "The Bank Transfer could not be posted.") }; }
  redirect(`/b/${businessId}/banking/transfers/${id}?notice=Bank Transfer posted`);
}

export async function voidBankTransferAction(businessId: string, transferId: string) {
  const { user } = await requirePermission(businessId, "banking", "delete");
  try { voidBankTransfer(businessId, user.id, transferId); return {}; }
  catch (error) { return { error: message(error, "The Bank Transfer could not be voided.") }; }
}

export async function importStatementAction(
  businessId: string, bankAccountId: string, fileName: string, csvText: string, mapping: unknown,
): Promise<BankingActionResult & { importedCount?: number; duplicateCount?: number }> {
  const { user } = await requirePermission(businessId, "banking", "create");
  const parsedMapping = csvMappingSchema.safeParse(mapping);
  if (!parsedMapping.success) return { error: "Map Date, Description, and either Amount or Debit/Credit columns." };
  try {
    const result = importBankStatement(businessId, user.id, bankAccountId, fileName, csvText, parsedMapping.data);
    revalidatePath(`/b/${businessId}/banking/accounts/${bankAccountId}`);
    return { importedCount: result.importedCount, duplicateCount: result.duplicateCount };
  } catch (error) { return { error: message(error, "The statement could not be imported.") }; }
}

export async function matchStatementLineAction(
  businessId: string, accountId: string, lineId: string, sourceType: MatchSourceType, sourceId: string,
) {
  const { user } = await requirePermission(businessId, "banking", "edit");
  try {
    confirmStatementMatch(businessId, user.id, lineId, sourceType, sourceId);
    revalidatePath(`/b/${businessId}/banking/accounts/${accountId}`);
    return {};
  } catch (error) { return { error: message(error, "The match could not be confirmed.") }; }
}

export async function ignoreStatementLineAction(businessId: string, accountId: string, lineId: string) {
  const { user } = await requirePermission(businessId, "banking", "edit");
  try { ignoreStatementLine(businessId, user.id, lineId); revalidatePath(`/b/${businessId}/banking/accounts/${accountId}`); return {}; }
  catch (error) { return { error: message(error, "The statement line could not be ignored.") }; }
}

export async function resetStatementLineAction(businessId: string, accountId: string, lineId: string) {
  const { user } = await requirePermission(businessId, "banking", "edit");
  try { resetStatementLine(businessId, user.id, lineId); revalidatePath(`/b/${businessId}/banking/accounts/${accountId}`); return {}; }
  catch (error) { return { error: message(error, "The statement line could not be reset.") }; }
}

export async function startReconciliationAction(
  businessId: string, accountId: string, input: unknown,
): Promise<BankingActionResult> {
  const { user } = await requirePermission(businessId, "banking", "create");
  const parsed = reconciliationInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the reconciliation fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = startReconciliation(businessId, user.id, accountId, parsed.data); }
  catch (error) { return { error: message(error, "The reconciliation could not be started.") }; }
  redirect(`/b/${businessId}/banking/accounts/${accountId}/reconcile?reconciliationId=${id}`);
}

export async function completeReconciliationAction(businessId: string, accountId: string, reconciliationId: string) {
  const { user } = await requirePermission(businessId, "banking", "post");
  try {
    completeReconciliation(businessId, user.id, accountId, reconciliationId);
    revalidatePath(`/b/${businessId}/banking/accounts/${accountId}`);
    return {};
  } catch (error) { return { error: message(error, "The reconciliation could not be completed.") }; }
}

export async function saveBankRuleAction(
  businessId: string,
  ruleId: string | null,
  input: unknown,
): Promise<BankingActionResult & { id?: string }> {
  const { user } = await requirePermission(businessId, "settings", "edit");
  const parsed = bankRuleInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please check the bank rule form fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  try {
    if (ruleId) {
      updateBankRule(businessId, user.id, ruleId, parsed.data);
      revalidatePath(`/b/${businessId}/settings/bank-rules`);
      revalidatePath(`/b/${businessId}/banking`);
      return { id: ruleId };
    } else {
      const id = createBankRule(businessId, user.id, parsed.data);
      revalidatePath(`/b/${businessId}/settings/bank-rules`);
      revalidatePath(`/b/${businessId}/banking`);
      return { id };
    }
  } catch (error) {
    return { error: message(error, "The bank rule could not be saved.") };
  }
}

export async function deleteBankRuleAction(
  businessId: string,
  ruleId: string,
): Promise<BankingActionResult> {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    deleteBankRule(businessId, user.id, ruleId);
    revalidatePath(`/b/${businessId}/settings/bank-rules`);
    revalidatePath(`/b/${businessId}/banking`);
    return {};
  } catch (error) {
    return { error: message(error, "The bank rule could not be deleted.") };
  }
}

export async function toggleBankRuleActiveAction(
  businessId: string,
  ruleId: string,
  isActive: boolean,
): Promise<BankingActionResult> {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    toggleBankRuleActive(businessId, user.id, ruleId, isActive);
    revalidatePath(`/b/${businessId}/settings/bank-rules`);
    revalidatePath(`/b/${businessId}/banking`);
    return {};
  } catch (error) {
    return { error: message(error, "Could not update bank rule status.") };
  }
}

export async function applyBankRuleAction(
  businessId: string,
  accountId: string,
  ruleId: string,
  statementLineId: string,
): Promise<BankingActionResult & { transactionId?: string }> {
  const { user } = await requirePermission(businessId, "banking", "edit");
  try {
    const result = applyBankRule(businessId, user.id, ruleId, statementLineId);
    revalidatePath(`/b/${businessId}/banking/accounts/${accountId}`);
    return { transactionId: result.transactionId };
  } catch (error) {
    return { error: message(error, "The bank rule could not be applied.") };
  }
}

export async function batchApplyBankRulesAction(
  businessId: string,
  accountId: string,
): Promise<BankingActionResult & { appliedCount?: number }> {
  const { user } = await requirePermission(businessId, "banking", "edit");
  try {
    const result = batchApplyBankRules(businessId, user.id, accountId);
    revalidatePath(`/b/${businessId}/banking/accounts/${accountId}`);
    return { appliedCount: result.appliedCount };
  } catch (error) {
    return { error: message(error, "Failed to batch auto-categorize statement lines.") };
  }
}

