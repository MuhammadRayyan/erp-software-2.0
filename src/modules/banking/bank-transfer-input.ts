import { z } from "zod";

export const bankTransferInputSchema = z.object({
  fromBankAccountId: z.string().uuid("Choose the source Bank Account"),
  toBankAccountId: z.string().uuid("Choose the destination Bank Account"),
  date: z.iso.date("Enter a valid transfer date"),
  amount: z.string().trim()
    .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero"),
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
}).refine((value) => value.fromBankAccountId !== value.toBankAccountId, {
  path: ["toBankAccountId"], message: "Source and destination accounts must differ",
});

export type BankTransferInput = z.input<typeof bankTransferInputSchema>;
