import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import { creditNoteReasonCodeValues } from "@/modules/einvoicing/einvoice-types";
import { emirates } from "@/modules/tax/uae-vat-config";

const quantitySchema = z.string().trim()
  .regex(/^\d{1,8}(?:\.\d{1,4})?$/, "Enter a quantity with up to 4 decimals")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero");
const moneySchema = z.string().trim()
  .regex(/^\d{1,10}(?:\.\d{1,6})?$/, "Enter an amount with up to 6 decimals");

export const creditNoteLineSchema = z.object({
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  salesAccountId: z.string().min(1, "Choose a sales account"),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
});

export const creditNoteInputSchema = z.object({
  ...exchangeRateInputShape,
  customerId: z.string().uuid("Choose a customer"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
  sourceInvoiceId: z.string().uuid("Choose a posted invoice"),
  date: z.iso.date("Enter a valid credit note date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  supplyEmirate: z.union([z.literal(""), z.enum(emirates)]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  reason: z.string().trim().max(500).optional().default(""),
  eInvoiceReasonCode: z.union([z.literal(""), z.enum(creditNoteReasonCodeValues)]).optional().default(""),
  eInvoiceTransactionFlags: z.object({
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
  }),
  lines: z.array(creditNoteLineSchema).min(1, "Add at least one line").max(100),
});

export type CreditNoteInput = z.input<typeof creditNoteInputSchema>;
