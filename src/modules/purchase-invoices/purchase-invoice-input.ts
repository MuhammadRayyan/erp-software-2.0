import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import {
  itemIdField,
  moneySchema,
  projectIdField,
  quantitySchema,
amountsIncludeTaxSchema, discountTypeSchema, discountValueSchema } from "@/core/validation/document-schemas";

export const purchaseInvoiceLineSchema = z.object({
  itemId: itemIdField,
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  discountType: discountTypeSchema,
  discountValue: discountValueSchema,
  unitPrice: moneySchema,
  expenseAccountId: z.string().min(1, "Choose an expense account"),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: projectIdField,
});

export const purchaseInvoiceInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  projectId: projectIdField,
  supplierInvoiceNumber: z.string().trim().min(1, "Enter the supplier invoice number").max(100),
  invoiceDate: z.iso.date("Enter a valid invoice date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  amountsIncludeTax: amountsIncludeTaxSchema,
  dueDate: z.iso.date("Enter a valid due date"),
  reference: z.string().trim().max(100).optional().default(""),
  purchaseOrderId: z.union([z.literal(""), z.string().uuid()]).optional().default(""),
  lines: z.array(purchaseInvoiceLineSchema).min(1, "Add at least one line").max(100),
});

export type PurchaseInvoiceInput = z.input<typeof purchaseInvoiceInputSchema>;
