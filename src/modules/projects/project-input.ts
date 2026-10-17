import { z } from "zod";

export const projectStatuses = ["draft", "active", "on_hold", "completed", "cancelled"] as const;

export const projectCustomerRoles = [
  "primary_client",
  "co_client",
  "joint_venture",
  "tenant",
  "bill_to",
  "sponsor",
  "consultant",
] as const;

export type ProjectCustomerRole = (typeof projectCustomerRoles)[number];

const optionalDate = z.union([z.literal(""), z.iso.date("Enter a valid date")]);
const optionalMoney = z.union([
  z.literal(""),
  z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals"),
]);

export const projectCustomerInputSchema = z.object({
  customerId: z.string().uuid("Choose a valid customer"),
  role: z.enum(projectCustomerRoles).default("co_client"),
  billingPercentage: z.union([
    z.literal(""),
    z.string().trim().regex(/^100(?:\.0{1,2})?$|^\d{1,2}(?:\.\d{1,2})?$/, "Enter a percentage from 0 to 100"),
  ]).optional().default(""),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().trim().max(1_000).optional().default(""),
});

export type ProjectCustomerInput = z.input<typeof projectCustomerInputSchema>;

export const projectInputSchema = z.object({
  code: z.string().trim().max(30, "Project code is too long").regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use letters, numbers, dots, slashes, underscores, or hyphens").or(z.literal("")),
  name: z.string().trim().min(1, "Enter a project name").max(160),
  customerId: z.union([z.literal(""), z.string().uuid("Choose a valid customer")]),
  status: z.enum(projectStatuses),
  description: z.string().trim().max(4_000).optional().default(""),
  startDate: optionalDate.optional().default(""),
  targetEndDate: optionalDate.optional().default(""),
  actualEndDate: optionalDate.optional().default(""),
  budgetRevenue: optionalMoney.optional().default(""),
  budgetCost: optionalMoney.optional().default(""),
  managerName: z.string().trim().max(160).optional().default(""),
  stakeholders: z.array(projectCustomerInputSchema).optional().default([]),
});

export const projectNoteInputSchema = z.object({
  body: z.string().trim().min(1, "Enter a note").max(4_000),
});

export type ProjectInput = z.input<typeof projectInputSchema>;
export type ProjectData = z.output<typeof projectInputSchema>;
export type ProjectStatus = (typeof projectStatuses)[number];
