import { z } from "zod";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";

export const pdcDirections = ["receivable", "payable"] as const;
export type PdcDirection = (typeof pdcDirections)[number];

export const pdcStatuses = ["held", "deposited", "cleared", "bounced", "cancelled"] as const;
export type PdcStatus = (typeof pdcStatuses)[number];

export const pdcInputSchema = z.object({
  direction: z.enum(pdcDirections),
  chequeNumber: z.string().trim().min(1, "Enter the cheque number").max(60),
  chequeBankName: z.string().trim().max(120).optional().default(""),
  issueDate: z.iso.date("Enter a valid issue date"),
  maturityDate: z.iso.date("Enter a valid maturity date"),
  customerId: z.string().trim().optional().default(""),
  supplierId: z.string().trim().optional().default(""),
  salesInvoiceId: z.string().trim().optional().default(""),
  purchaseInvoiceId: z.string().trim().optional().default(""),
  bankAccountId: z.string().trim().min(1, "Select the clearing bank account"),
  amount: z.string().trim().min(1, "Enter cheque amount"),
  reference: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
}).superRefine((data, ctx) => {
  if (data.maturityDate < data.issueDate) {
    ctx.addIssue({
      code: "custom",
      path: ["maturityDate"],
      message: "Maturity date cannot precede issue date.",
    });
  }
  if (data.direction === "receivable" && !data.customerId) {
    ctx.addIssue({
      code: "custom",
      path: ["customerId"],
      message: "Select the customer for a receivable post-dated cheque.",
    });
  }
  if (data.direction === "payable" && !data.supplierId) {
    ctx.addIssue({
      code: "custom",
      path: ["supplierId"],
      message: "Select the supplier for a payable post-dated cheque.",
    });
  }
  try {
    const minor = parseCurrencyAmountToMinor(data.amount, 2);
    if (minor <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Cheque amount must be greater than zero.",
      });
    }
  } catch {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "Enter a valid positive cheque amount.",
    });
  }
});

export type PdcInput = z.input<typeof pdcInputSchema>;
