import { z } from "zod";

export const projectStatuses = ["draft", "active", "on_hold", "completed", "cancelled"] as const;

const optionalDate = z.union([z.literal(""), z.iso.date("Enter a valid date")]);
const optionalMoney = z.union([
  z.literal(""),
  z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals"),
]);

export const projectInputSchema = z.object({
  code: z.string().trim().max(30, "Project code is too long").regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use letters, numbers, dots, slashes, underscores, or hyphens").or(z.literal("")),
  name: z.string().trim().min(1, "Enter a project name").max(160),
  customerId: z.union([z.literal(""), z.string().uuid("Choose a valid customer")]),
  status: z.enum(projectStatuses),
  description: z.string().trim().max(4_000).optional().default(""),
  startDate: optionalDate,
  targetEndDate: optionalDate,
  actualEndDate: optionalDate,
  budgetRevenue: optionalMoney,
  budgetCost: optionalMoney,
  managerName: z.string().trim().max(160).optional().default(""),
});

export const projectNoteInputSchema = z.object({
  body: z.string().trim().min(1, "Enter a note").max(4_000),
});

export type ProjectInput = z.input<typeof projectInputSchema>;
export type ProjectData = z.output<typeof projectInputSchema>;
export type ProjectStatus = (typeof projectStatuses)[number];
