import { z } from "zod";
const quantity = z.string().trim().regex(/^\d{1,8}(?:\.\d{1,4})?$/, "Enter a quantity with up to 4 decimals").refine((value) => Number(value) > 0, "Quantity must be greater than zero");
const optionalUuid = z.union([z.literal(""), z.string().uuid()]).optional().default("");
export const deliveryNoteInputSchema = z.object({
  customerId: z.string().uuid("Choose a customer"), salesInvoiceId: optionalUuid, date: z.iso.date("Enter a valid delivery date"),
  locationId: z.string().min(1, "Choose a location"), reference: z.string().trim().max(100).optional().default(""),
  projectId: optionalUuid, notes: z.string().trim().max(1_000).optional().default(""),
  lines: z.array(z.object({ itemId: z.string().uuid("Choose an inventory item"), description: z.string().trim().min(1, "Enter a description").max(300), quantity, projectId: optionalUuid, salesInvoiceLineId: optionalUuid })).min(1, "Add at least one line").max(100),
});
export type DeliveryNoteInput = z.input<typeof deliveryNoteInputSchema>;
