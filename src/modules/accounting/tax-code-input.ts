import { z } from "zod";

export const taxCodeInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a tax code name").max(80),
  rate: z.string().trim().regex(/^\d{1,3}(?:\.\d{1,2})?$/, "Enter a tax rate with up to 2 decimals"),
  direction: z.enum(["sales", "purchases", "both"]).optional().default("both"),
  vatCategory: z.enum(["standard", "zero_rated", "exempt", "out_of_scope", "reverse_charge", "import"]),
  salesTaxAccountId: z.string().optional().default(""),
  purchaseTaxAccountId: z.string().optional().default(""),
  isRecoverable: z.boolean().optional().default(false),
  isActive: z.boolean().default(true),
});

export type TaxCodeInput = z.input<typeof taxCodeInputSchema>;
