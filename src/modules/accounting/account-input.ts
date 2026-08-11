import { z } from "zod";
import { accountSubtypes, accountTypes } from "./account-types";

export const accountInputSchema = z.object({
  code: z.string().trim().min(1, "Enter an account code").max(20),
  name: z.string().trim().min(2, "Enter an account name").max(100),
  type: z.enum(accountTypes),
  subtype: z.enum(accountSubtypes),
  isActive: z.boolean().default(true),
});

export type AccountInput = z.input<typeof accountInputSchema>;

export const accountTypeLabels: Record<(typeof accountTypes)[number], string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

export const accountSubtypeLabels: Record<(typeof accountSubtypes)[number], string> = {
  cash: "Cash",
  bank: "Bank",
  accounts_receivable: "Accounts Receivable",
  accounts_payable: "Accounts Payable",
  current_asset: "Current Asset",
  fixed_asset: "Fixed Asset",
  current_liability: "Current Liability",
  tax_payable: "Tax Payable",
  equity: "Equity",
  sales: "Sales",
  other_income: "Other Income",
  cost_of_sales: "Cost of Sales",
  operating_expense: "Operating Expense",
  other_expense: "Other Expense",
};

export const accountSubtypesByType: Record<
  (typeof accountTypes)[number],
  readonly (typeof accountSubtypes)[number][]
> = {
  asset: ["cash", "bank", "accounts_receivable", "current_asset", "fixed_asset"],
  liability: ["accounts_payable", "current_liability", "tax_payable"],
  equity: ["equity"],
  income: ["sales", "other_income"],
  expense: ["cost_of_sales", "operating_expense", "other_expense"],
};
