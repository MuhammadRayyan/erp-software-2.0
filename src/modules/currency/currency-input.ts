import { z } from "zod";

export const currencyCodeInputSchema = z.string().trim().length(3)
  .transform((value) => value.toUpperCase()).default("AED");

export const exchangeRateInputSchema = z.object({
  currencyCode: currencyCodeInputSchema,
  exchangeRateToBase: z.string().trim().max(40).optional().default(""),
  exchangeRateDate: z.union([z.literal(""), z.iso.date()]).optional().default(""),
  exchangeRateSource: z.union([z.literal(""), z.enum(["Base", "Manual", "CBUAE"])]).optional().default(""),
});

export const exchangeRateInputShape = exchangeRateInputSchema.shape;

