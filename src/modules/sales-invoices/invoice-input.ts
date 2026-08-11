import { z } from "zod";
import { emirates } from "@/modules/tax/uae-vat-config";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";

const transactionFlagsSchema = z.object({
  freeTradeZone: z.boolean().optional().default(false),
  deemedSupply: z.boolean().optional().default(false),
  marginScheme: z.boolean().optional().default(false),
  summaryInvoice: z.boolean().optional().default(false),
  continuousSupply: z.boolean().optional().default(false),
  agentBilling: z.boolean().optional().default(false),
  eCommerce: z.boolean().optional().default(false),
  export: z.boolean().optional().default(false),
}).optional().default({
  freeTradeZone: false,
  deemedSupply: false,
  marginScheme: false,
  summaryInvoice: false,
  continuousSupply: false,
  agentBilling: false,
  eCommerce: false,
  export: false,
});

const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}(?:\.\d{1,4})?$/, "Enter a quantity with up to 4 decimals")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero");

const moneyInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,6})?$/, "Enter an amount with up to 6 decimals");

export const invoiceLineSchema = z.object({
  itemId: z.union([z.literal(""), z.string().uuid("Choose a valid inventory item")]).optional().default(""),
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  unitPrice: moneyInputSchema,
  salesAccountId: z.string().min(1, "Choose a sales account"),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
});

export const invoiceInputSchema = z.object({
  ...exchangeRateInputShape,
  customerId: z.string().uuid("Choose a customer"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
  invoiceDate: z.iso.date("Enter a valid invoice date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  supplyEmirate: z.union([z.literal(""), z.enum(emirates)]).optional().default(""),
  dueDate: z.iso.date("Enter a valid due date"),
  reference: z.string().trim().max(100).optional().default(""),
  eInvoiceTransactionFlags: transactionFlagsSchema,
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line").max(100),
});

export type InvoiceInput = z.input<typeof invoiceInputSchema>;
export type InvoiceData = z.output<typeof invoiceInputSchema>;
