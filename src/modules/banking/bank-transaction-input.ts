import { z } from "zod";
import { emirates } from "@/modules/tax/uae-vat-config";

const optionalUuid = z.union([z.literal(""), z.string().uuid()]).optional().default("");
const positiveMoney = z.string().trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");

export const bankTransactionInputSchema = z.object({
  bankAccountId: z.string().uuid("Choose a Bank Account"),
  date: z.iso.date("Enter a valid transaction date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  supplyEmirate: z.union([z.literal(""), z.enum(emirates)]).optional().default(""),
  type: z.enum(["money_in", "money_out"]),
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().min(1, "Enter a description").max(300),
  statementLineId: optionalUuid,
  lines: z.array(z.object({
    accountId: z.string().min(1, "Choose a counter account"),
    taxCodeId: z.string().min(1, "Choose a tax code"),
    projectId: optionalUuid,
    description: z.string().trim().min(1, "Enter a line description").max(300),
    amount: positiveMoney,
  })).min(1, "Add at least one line").max(50),
});

export type BankTransactionInput = z.input<typeof bankTransactionInputSchema>;
export type BankTransactionIntent = "draft" | "post";
