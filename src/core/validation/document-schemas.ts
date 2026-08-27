import { z } from "zod";

/**
 * Shared Zod building blocks for commercial document input schemas.
 * Keep these canonical: document modules must import from here instead of
 * redefining identical quantity/money/flag/project schemas locally.
 */

export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}(?:\.\d{1,4})?$/, "Enter a quantity with up to 4 decimals")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero");

export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,6})?$/, "Enter an amount with up to 6 decimals");

/** Positive money input (settlement amounts, receipt/payment totals). */
export const positiveMoneySchema = moneySchema.refine(
  (value) => Number(value) > 0,
  "Amount must be greater than zero",
);

export const projectIdField = z
  .union([z.literal(""), z.string().uuid("Choose a valid project")])
  .optional()
  .default("");

export const itemIdField = z
  .union([z.literal(""), z.string().uuid("Choose a valid inventory item")])
  .optional()
  .default("");

export const amountsIncludeTaxSchema = z.boolean().default(false);

export const discountTypeSchema = z.enum(["none", "percentage", "fixed"]).default("none");
export const discountValueSchema = z.string().trim().default("0");
