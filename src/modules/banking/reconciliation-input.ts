import { z } from "zod";

export const reconciliationInputSchema = z.object({
  statementDate: z.iso.date("Enter a valid statement date"),
  statementEndingBalance: z.string().trim()
    .regex(/^-?\d{1,12}(?:\.\d{1,2})?$/, "Enter a balance with up to 2 decimals"),
});

export type ReconciliationInput = z.input<typeof reconciliationInputSchema>;
