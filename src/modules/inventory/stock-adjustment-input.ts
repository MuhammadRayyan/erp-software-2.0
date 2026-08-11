import { z } from "zod";
const signedQuantity = z.string().trim().regex(/^[+-]?\d{1,8}(?:\.\d{1,4})?$/, "Enter a positive or negative quantity with up to 4 decimals").refine((value) => Number(value) !== 0, "Quantity change cannot be zero");
const optionalMoney = z.union([z.literal(""), z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a unit cost with up to 2 decimals")]).optional().default("");
const optionalUuid = z.union([z.literal(""), z.string().uuid()]).optional().default("");
export const stockAdjustmentInputSchema = z.object({ date: z.iso.date(), locationId: z.string().min(1, "Choose a location"), itemId: z.string().uuid("Choose an item"), quantityChange: signedQuantity, unitCost: optionalMoney, reason: z.string().trim().min(1, "Enter a reason").max(120), projectId: optionalUuid, notes: z.string().trim().max(1_000).optional().default("") }).superRefine((value, context) => {
  if (value.reason.toLowerCase() !== "opening balance") return;
  if (Number(value.quantityChange) <= 0) context.addIssue({ code: "custom", path: ["quantityChange"], message: "Opening Balance quantity must be positive" });
  if (!value.unitCost || Number(value.unitCost) <= 0) context.addIssue({ code: "custom", path: ["unitCost"], message: "Opening Balance requires a unit cost greater than zero" });
});
export type StockAdjustmentInput = z.input<typeof stockAdjustmentInputSchema>;
