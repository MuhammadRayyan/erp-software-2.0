import { z } from "zod";

export const bankAccountInputSchema = z.object({
  name: z.string().trim().min(1, "Enter an account name").max(120),
  accountCode: z.string().trim().max(40).optional().default(""),
  bankName: z.string().trim().max(120).optional().default(""),
  accountNumberMasked: z.string().trim().max(40).optional().default(""),
  currencyCode: z.string().trim().length(3, "Use a three-letter currency code").transform((value) => value.toUpperCase()),
  ledgerAccountId: z.string().min(1, "Choose a Bank or Cash ledger account"),
  isCashAccount: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type BankAccountInput = z.input<typeof bankAccountInputSchema>;
