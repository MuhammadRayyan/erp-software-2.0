import { z } from "zod";

export const inventoryLocationInputSchema = z.object({
  code: z.string().trim().min(1, "Enter a location code").max(30),
  name: z.string().trim().min(1, "Enter a location name").max(160),
  address: z.string().trim().max(500).optional().default(""),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).refine((value) => !value.isDefault || value.isActive, { path: ["isActive"], message: "The default location must remain active" });
export type InventoryLocationInput = z.input<typeof inventoryLocationInputSchema>;
