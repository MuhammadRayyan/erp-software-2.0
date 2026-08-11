import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";

const quantitySchema = z.string().trim().regex(/^\d{1,8}(?:\.\d{1,4})?$/, "Enter a quantity with up to 4 decimals").refine((value) => Number(value) > 0, "Quantity must be greater than zero");
const moneySchema = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,6})?$/, "Enter an amount with up to 6 decimals");

export const purchaseInvoiceLineSchema = z.object({
  itemId: z.union([z.literal(""), z.string().uuid("Choose a valid inventory item")]).optional().default(""),
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  expenseAccountId: z.string().min(1, "Choose an expense account"),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
});

export const purchaseInvoiceInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
  supplierInvoiceNumber: z.string().trim().min(1, "Enter the supplier invoice number").max(100),
  invoiceDate: z.iso.date("Enter a valid invoice date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  dueDate: z.iso.date("Enter a valid due date"),
  reference: z.string().trim().max(100).optional().default(""),
  purchaseOrderId: z.union([z.literal(""), z.string().uuid()]).optional().default(""),
  lines: z.array(purchaseInvoiceLineSchema).min(1, "Add at least one line").max(100),
});

export type PurchaseInvoiceInput = z.input<typeof purchaseInvoiceInputSchema>;
