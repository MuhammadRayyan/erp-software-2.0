import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getBusinessDb } from "@/core/db/business";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { saveBankTransaction } from "./bank-transaction-service";
import type { StatementLineRow } from "./statement-service";

export type BankRuleDirection = "money_in" | "money_out" | "both";
export type BankRuleMatchField = "description" | "reference" | "any";
export type BankRuleMatchType = "contains" | "exact" | "starts_with";

export type BankRule = {
  id: string;
  name: string;
  rule_order: number;
  direction: BankRuleDirection;
  match_field: BankRuleMatchField;
  match_type: BankRuleMatchType;
  match_text: string;
  bank_account_id: string | null;
  target_account_id: string;
  target_tax_code_id: string | null;
  auto_description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  bank_account_name?: string | null;
  target_account_name?: string | null;
  target_tax_code_name?: string | null;
};

export const bankRuleInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a rule name").max(120),
  ruleOrder: z.number().int().optional().default(0),
  direction: z.enum(["money_in", "money_out", "both"]).default("both"),
  matchField: z.enum(["description", "reference", "any"]).default("any"),
  matchType: z.enum(["contains", "exact", "starts_with"]).default("contains"),
  matchText: z.string().trim().min(1, "Enter text to match against").max(200),
  bankAccountId: z.union([z.literal(""), z.string().uuid()]).optional().nullable(),
  targetAccountId: z.string().min(1, "Choose a target GL account"),
  targetTaxCodeId: z.union([z.literal(""), z.string()]).optional().nullable(),
  autoDescription: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export type BankRuleInput = z.input<typeof bankRuleInputSchema>;

export function listBankRules(
  businessId: string,
  userId: string,
  bankAccountId?: string,
): BankRule[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT
      br.*,
      ba.name AS bank_account_name,
      a.name AS target_account_name,
      tc.name AS target_tax_code_name
    FROM bank_rules br
    LEFT JOIN bank_accounts ba ON ba.id = br.bank_account_id
    INNER JOIN accounts a ON a.id = br.target_account_id
    LEFT JOIN tax_codes tc ON tc.id = br.target_tax_code_id
    WHERE (? IS NULL OR br.bank_account_id IS NULL OR br.bank_account_id = ?)
    ORDER BY br.rule_order ASC, br.created_at ASC
  `).all(bankAccountId ?? null, bankAccountId ?? null) as BankRule[];

  return rows;
}

export function getBankRule(
  businessId: string,
  userId: string,
  ruleId: string,
): BankRule | undefined {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT
      br.*,
      ba.name AS bank_account_name,
      a.name AS target_account_name,
      tc.name AS target_tax_code_name
    FROM bank_rules br
    LEFT JOIN bank_accounts ba ON ba.id = br.bank_account_id
    INNER JOIN accounts a ON a.id = br.target_account_id
    LEFT JOIN tax_codes tc ON tc.id = br.target_tax_code_id
    WHERE br.id = ?
  `).get(ruleId) as BankRule | undefined;
}

export function createBankRule(
  businessId: string,
  userId: string,
  rawInput: BankRuleInput,
): string {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const data = bankRuleInputSchema.parse(rawInput);
  const context = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const now = new Date().toISOString();

  // Validate target account
  const account = context.sqlite.prepare(
    "SELECT id, is_active FROM accounts WHERE id = ?"
  ).get(data.targetAccountId) as { id: string; is_active: number } | undefined;
  if (!account || !account.is_active) {
    throw new Error("Target account not found or is inactive.");
  }

  // Validate target tax code if provided
  const taxCodeId = data.targetTaxCodeId?.trim() || null;
  if (taxCodeId) {
    const tax = context.sqlite.prepare(
      "SELECT id, is_active FROM tax_codes WHERE id = ?"
    ).get(taxCodeId) as { id: string; is_active: number } | undefined;
    if (!tax || !tax.is_active) {
      throw new Error("Target tax code not found or is inactive.");
    }
  }

  // Validate bank account if specified
  const bankAccountId = data.bankAccountId?.trim() || null;
  if (bankAccountId) {
    const bank = context.sqlite.prepare(
      "SELECT id, is_active FROM bank_accounts WHERE id = ?"
    ).get(bankAccountId) as { id: string; is_active: number } | undefined;
    if (!bank || !bank.is_active) {
      throw new Error("Specified bank account not found or is inactive.");
    }
  }

  // Determine rule order if 0
  let order = data.ruleOrder;
  if (order === 0) {
    const maxOrderRow = context.sqlite.prepare(
      "SELECT COALESCE(MAX(rule_order), 0) AS max_order FROM bank_rules"
    ).get() as { max_order: number };
    order = (maxOrderRow.max_order || 0) + 10;
  }

  context.sqlite.prepare(`
    INSERT INTO bank_rules (
      id, name, rule_order, direction, match_field, match_type, match_text,
      bank_account_id, target_account_id, target_tax_code_id, auto_description,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    order,
    data.direction,
    data.matchField,
    data.matchType,
    data.matchText.trim(),
    bankAccountId,
    data.targetAccountId,
    taxCodeId,
    data.autoDescription?.trim() || null,
    data.isActive ? 1 : 0,
    now,
    now,
  );

  try {
    recordActivity(businessId, {
      userId,
      action: "created",
      entityType: "bank_rule",
      entityId: id,
      entityNumber: data.name,
      summary: `Created bank rule "${data.name}" (${data.matchField} ${data.matchType} "${data.matchText}")`,
      details: { name: data.name, direction: data.direction, matchField: data.matchField, matchType: data.matchType, matchText: data.matchText },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] bank_rule create failed:", e);
  }

  return id;
}

export function updateBankRule(
  businessId: string,
  userId: string,
  ruleId: string,
  rawInput: BankRuleInput,
): void {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const data = bankRuleInputSchema.parse(rawInput);
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  const existing = context.sqlite.prepare(
    "SELECT id FROM bank_rules WHERE id = ?"
  ).get(ruleId);
  if (!existing) throw new Error("Bank rule not found.");

  // Validate target account
  const account = context.sqlite.prepare(
    "SELECT id, is_active FROM accounts WHERE id = ?"
  ).get(data.targetAccountId) as { id: string; is_active: number } | undefined;
  if (!account || !account.is_active) {
    throw new Error("Target account not found or is inactive.");
  }

  const taxCodeId = data.targetTaxCodeId?.trim() || null;
  if (taxCodeId) {
    const tax = context.sqlite.prepare(
      "SELECT id, is_active FROM tax_codes WHERE id = ?"
    ).get(taxCodeId) as { id: string; is_active: number } | undefined;
    if (!tax || !tax.is_active) {
      throw new Error("Target tax code not found or is inactive.");
    }
  }

  const bankAccountId = data.bankAccountId?.trim() || null;
  if (bankAccountId) {
    const bank = context.sqlite.prepare(
      "SELECT id, is_active FROM bank_accounts WHERE id = ?"
    ).get(bankAccountId) as { id: string; is_active: number } | undefined;
    if (!bank || !bank.is_active) {
      throw new Error("Specified bank account not found or is inactive.");
    }
  }

  context.sqlite.prepare(`
    UPDATE bank_rules SET
      name = ?,
      direction = ?,
      match_field = ?,
      match_type = ?,
      match_text = ?,
      bank_account_id = ?,
      target_account_id = ?,
      target_tax_code_id = ?,
      auto_description = ?,
      is_active = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.name,
    data.direction,
    data.matchField,
    data.matchType,
    data.matchText.trim(),
    bankAccountId,
    data.targetAccountId,
    taxCodeId,
    data.autoDescription?.trim() || null,
    data.isActive ? 1 : 0,
    now,
    ruleId,
  );

  try {
    recordActivity(businessId, {
      userId,
      action: "updated",
      entityType: "bank_rule",
      entityId: ruleId,
      entityNumber: data.name,
      summary: `Updated bank rule "${data.name}"`,
      details: { name: data.name, direction: data.direction, matchField: data.matchField, matchType: data.matchType, matchText: data.matchText },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] bank_rule update failed:", e);
  }
}

export function deleteBankRule(
  businessId: string,
  userId: string,
  ruleId: string,
): void {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const existing = sqlite.prepare("SELECT name FROM bank_rules WHERE id = ?").get(ruleId) as { name: string } | undefined;
  const result = sqlite.prepare("DELETE FROM bank_rules WHERE id = ?").run(ruleId);
  if (result.changes === 0) throw new Error("Bank rule not found.");

  if (existing) {
    try {
      recordActivity(businessId, {
        userId,
        action: "deleted",
        entityType: "bank_rule",
        entityId: ruleId,
        entityNumber: existing.name,
        summary: `Deleted bank rule "${existing.name}"`,
        sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] bank_rule delete failed:", e);
    }
  }
}

export function toggleBankRuleActive(
  businessId: string,
  userId: string,
  ruleId: string,
  isActive: boolean,
): void {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite.prepare(
    "UPDATE bank_rules SET is_active = ?, updated_at = ? WHERE id = ?"
  ).run(isActive ? 1 : 0, now, ruleId);
}

export function reorderBankRules(
  businessId: string,
  userId: string,
  ruleIds: string[],
): void {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    const stmt = context.sqlite.prepare(
      "UPDATE bank_rules SET rule_order = ?, updated_at = ? WHERE id = ?"
    );
    ruleIds.forEach((id, index) => {
      stmt.run((index + 1) * 10, now, id);
    });
  }).immediate();
}

export function matchRuleAgainstLine(
  rule: BankRule,
  line: {
    description: string;
    reference?: string | null;
    amount_minor: number;
    bank_account_id: string;
  },
): boolean {
  if (!rule.is_active) return false;

  // 1. Bank account filter
  if (rule.bank_account_id && rule.bank_account_id !== line.bank_account_id) {
    return false;
  }

  // 2. Direction check
  const isMoneyIn = line.amount_minor > 0;
  const isMoneyOut = line.amount_minor < 0;
  if (rule.direction === "money_in" && !isMoneyIn) return false;
  if (rule.direction === "money_out" && !isMoneyOut) return false;

  // 3. Text pattern check (case-insensitive)
  const pattern = rule.match_text.trim().toLowerCase();
  if (!pattern) return false;

  const desc = (line.description || "").trim().toLowerCase();
  const ref = (line.reference || "").trim().toLowerCase();

  const testField = (value: string) => {
    switch (rule.match_type) {
      case "exact":
        return value === pattern;
      case "starts_with":
        return value.startsWith(pattern);
      case "contains":
      default:
        return value.includes(pattern);
    }
  };

  switch (rule.match_field) {
    case "description":
      return testField(desc);
    case "reference":
      return testField(ref);
    case "any":
    default:
      return testField(desc) || testField(ref);
  }
}

export function findMatchingBankRule(
  rules: BankRule[],
  line: {
    description: string;
    reference?: string | null;
    amount_minor: number;
    bank_account_id: string;
  },
): BankRule | null {
  for (const rule of rules) {
    if (matchRuleAgainstLine(rule, line)) {
      return rule;
    }
  }
  return null;
}

export function applyBankRule(
  businessId: string,
  userId: string,
  ruleId: string,
  statementLineId: string,
): { transactionId: string } {
  assertMutationPermission(businessId, userId, "banking", "edit");
  const context = getBusinessDb(businessId, userId);
  const rule = getBankRule(businessId, userId, ruleId);
  if (!rule) throw new Error("Bank rule not found.");
  if (!rule.is_active) throw new Error("Bank rule is inactive.");

  const line = context.sqlite.prepare(`
    SELECT bsl.*, ba.name AS bank_account_name
    FROM bank_statement_lines bsl
    INNER JOIN bank_accounts ba ON ba.id = bsl.bank_account_id
    WHERE bsl.id = ?
  `).get(statementLineId) as (StatementLineRow & { bank_account_name: string }) | undefined;

  if (!line) throw new Error("Statement line not found.");
  if (line.match_status !== "unmatched") throw new Error("Statement line is no longer unmatched.");

  if (!matchRuleAgainstLine(rule, line)) {
    throw new Error(`Statement line does not match rule "${rule.name}".`);
  }

  const isMoneyIn = line.amount_minor > 0;
  const autoDesc = rule.auto_description?.trim() || line.description;
  const absAmount = Math.abs(line.amount_minor);
  const formattedAmount = (absAmount / 100).toFixed(2);

  // Fallback to a zero-rate/exempt tax code if no specific tax code is configured
  let taxCodeId = rule.target_tax_code_id;
  if (!taxCodeId) {
    const defaultTax = context.sqlite.prepare(`
      SELECT id FROM tax_codes WHERE is_active = 1 AND rate_basis_points = 0 ORDER BY id LIMIT 1
    `).get() as { id: string } | undefined;
    taxCodeId = defaultTax?.id || "tax-no-vat";
  }

  const transactionId = saveBankTransaction(
    businessId,
    userId,
    {
      bankAccountId: line.bank_account_id,
      date: line.transaction_date,
      taxDate: line.transaction_date,
      type: isMoneyIn ? "money_in" : "money_out",
      reference: line.reference || "",
      description: autoDesc,
      statementLineId: line.id,
      lines: [
        {
          accountId: rule.target_account_id,
          taxCodeId,
          projectId: "",
          description: autoDesc,
          amount: formattedAmount,
        },
      ],
    },
    "post",
  );

  return { transactionId };
}

export function batchApplyBankRules(
  businessId: string,
  userId: string,
  bankAccountId: string,
): {
  appliedCount: number;
  matchedLines: { lineId: string; ruleName: string; transactionId: string }[];
} {
  assertMutationPermission(businessId, userId, "banking", "edit");
  const context = getBusinessDb(businessId, userId);
  const rules = listBankRules(businessId, userId, bankAccountId).filter((r) => r.is_active);
  if (rules.length === 0) return { appliedCount: 0, matchedLines: [] };

  const unmatchedLines = context.sqlite.prepare(`
    SELECT * FROM bank_statement_lines
    WHERE bank_account_id = ? AND match_status = 'unmatched'
    ORDER BY transaction_date ASC, created_at ASC
  `).all(bankAccountId) as StatementLineRow[];

  const matchedLines: { lineId: string; ruleName: string; transactionId: string }[] = [];

  for (const line of unmatchedLines) {
    const matchedRule = findMatchingBankRule(rules, line);
    if (matchedRule) {
      try {
        const { transactionId } = applyBankRule(businessId, userId, matchedRule.id, line.id);
        matchedLines.push({
          lineId: line.id,
          ruleName: matchedRule.name,
          transactionId,
        });
      } catch (err) {
        // Individual line error (e.g. locked date) doesn't abort the entire batch
        console.warn(`[bank-rules] failed applying rule to line ${line.id}:`, err);
      }
    }
  }

  return { appliedCount: matchedLines.length, matchedLines };
}

export function getRuleMatchesCount(
  businessId: string,
  userId: string,
  bankAccountId: string,
): { totalUnmatched: number; ruleMatchesCount: number; matchedLineIds: string[] } {
  const context = getBusinessDb(businessId, userId);
  const rules = listBankRules(businessId, userId, bankAccountId).filter((r) => r.is_active);

  const unmatchedLines = context.sqlite.prepare(`
    SELECT * FROM bank_statement_lines
    WHERE bank_account_id = ? AND match_status = 'unmatched'
  `).all(bankAccountId) as StatementLineRow[];

  if (rules.length === 0 || unmatchedLines.length === 0) {
    return {
      totalUnmatched: unmatchedLines.length,
      ruleMatchesCount: 0,
      matchedLineIds: [],
    };
  }

  const matchedLineIds: string[] = [];
  for (const line of unmatchedLines) {
    if (findMatchingBankRule(rules, line)) {
      matchedLineIds.push(line.id);
    }
  }

  return {
    totalUnmatched: unmatchedLines.length,
    ruleMatchesCount: matchedLineIds.length,
    matchedLineIds,
  };
}
