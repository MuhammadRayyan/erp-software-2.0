import { z } from "zod";
import { vatAdjustmentBuckets } from "./uae-vat-config";

export const vatPeriodInputSchema = z.object({
  periodReference: z.string().trim().min(2, "Enter a period reference").max(80),
  startDate: z.iso.date("Enter a valid start date"),
  endDate: z.iso.date("Enter a valid end date"),
  filingDueDate: z.iso.date("Enter a valid filing due date"),
  notes: z.string().trim().max(1000).optional().default(""),
}).superRefine((data, context) => {
  if (data.endDate < data.startDate) context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date." });
});

export const reopenPeriodInputSchema = z.object({ reason: z.string().trim().min(3, "Enter a reopening reason").max(500) });
export const filedExternallyInputSchema = z.object({
  filedAt: z.iso.date("Enter the external filing date"),
  filingReference: z.string().trim().max(120).optional().default(""),
});
export const vatAdjustmentInputSchema = z.object({
  reportBucket: z.enum(vatAdjustmentBuckets),
  amount: z.string().trim().regex(/^-?\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals"),
  vatAmount: z.string().trim().regex(/^-?\d{1,10}(?:\.\d{1,2})?$/, "Enter a VAT amount with up to 2 decimals"),
  reason: z.string().trim().min(3, "Enter an adjustment reason").max(500),
  reference: z.string().trim().max(120).optional().default(""),
});

export type VatPeriodInput = z.input<typeof vatPeriodInputSchema>;
export type ReopenPeriodInput = z.input<typeof reopenPeriodInputSchema>;
export type FiledExternallyInput = z.input<typeof filedExternallyInputSchema>;
export type VatAdjustmentInput = z.input<typeof vatAdjustmentInputSchema>;
