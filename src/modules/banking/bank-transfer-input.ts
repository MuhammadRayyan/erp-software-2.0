import { z } from "zod";

const positiveAmount = z.string().trim()
  .regex(/^\d{1,12}(?:\.\d{1,6})?$/, "Enter a valid positive amount")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");

export const bankTransferInputSchema = z.object({
  fromBankAccountId: z.string().uuid("Choose the source Bank Account"),
  toBankAccountId: z.string().uuid("Choose the destination Bank Account"),
  date: z.iso.date("Enter a valid transfer date"),
  /** Amount leaving the source account, in the source account's currency. */
  amount: positiveAmount,
  /**
   * Amount arriving in the destination account, in its currency. Required when
   * the two accounts use different currencies (the implied rate); ignored otherwise.
   */
  toAmount: z.union([z.literal(""), positiveAmount]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
}).refine((value) => value.fromBankAccountId !== value.toBankAccountId, {
  path: ["toBankAccountId"], message: "Source and destination accounts must differ",
});

export type BankTransferInput = z.input<typeof bankTransferInputSchema>;
