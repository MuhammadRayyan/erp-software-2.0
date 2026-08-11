import { z } from "zod";

export const businessInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a business name").max(100),
  country: z.string().trim().min(2).max(80).default("United Arab Emirates"),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("AED"),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12).default(1),
});

export type BusinessInput = z.input<typeof businessInputSchema>;
