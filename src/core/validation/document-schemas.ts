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
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimal places");

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
export const discountValueSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Discount must be a positive number with up to 2 decimal places"),
  ])
  .transform((val) => (val === "" ? "0" : val))
  .default("0");

export const lineCustomFieldsSchema = z
  .record(
    z.string(),
    z.union([z.string(), z.boolean()]).transform((val) => (typeof val === "boolean" ? (val ? "true" : "false") : val)),
  )
  .optional();

