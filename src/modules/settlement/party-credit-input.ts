import { z } from "zod";
import { positiveMoneySchema } from "@/core/validation/document-schemas";

export const applyNoteCreditInputSchema = z.object({
  noteId: z.string().trim().min(1, "Choose a credit note"),
  documentId: z.string().trim().min(1, "Choose an invoice"),
  amount: positiveMoneySchema,
});

export type ApplyNoteCreditInput = z.input<typeof applyNoteCreditInputSchema>;

export const partyRefundInputSchema = z.object({
  noteId: z.string().trim().min(1, "Choose the credit to refund"),
  date: z.iso.date("Enter a valid refund date"),
  bankAccountId: z.string().trim().min(1, "Choose a Bank or Cash account"),
  amount: positiveMoneySchema,
  exchangeRateToBase: z.string().trim().max(40).optional().default(""),
  exchangeRateDate: z.union([z.literal(""), z.iso.date()]).optional().default(""),
  exchangeRateSource: z.union([z.literal(""), z.enum(["Base", "Manual", "CBUAE"])]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
});

export type PartyRefundInput = z.input<typeof partyRefundInputSchema>;
