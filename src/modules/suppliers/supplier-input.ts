import { z } from "zod";

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address")]);

export const supplierInputSchema = z.object({
  defaultCurrencyCode: z.union([z.literal(""), z.string().trim().length(3).transform((value) => value.toUpperCase())]).optional().default(""),
  name: z.string().trim().min(2, "Enter a supplier name").max(160),
  email: optionalEmail.optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
  taxReference: z.string().trim().max(100).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  legalName: z.string().trim().max(200).optional().default(""),
  trn: z.union([
    z.literal(""),
    z.string().trim().regex(/^1\d{12}03$/, "TRN must be 15 digits, begin with 1, and end with 03"),
  ]).optional().default(""),
  legalRegistrationIdentifier: z.string().trim().max(100).optional().default(""),
  electronicAddress: z.string().trim().max(200).optional().default(""),
  electronicAddressScheme: z.string().trim().max(50).optional().default(""),
  registeredAddress: z.string().trim().max(500).optional().default(""),
  countryCode: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}$/, "Use a two-letter country code").optional().default(""),
  notes: z.string().trim().max(1_000).optional().default(""),
  isActive: z.boolean().default(true),
}).refine((data) => !data.electronicAddress || Boolean(data.electronicAddressScheme), {
  message: "Enter the electronic address scheme",
  path: ["electronicAddressScheme"],
}).refine((data) => !data.electronicAddressScheme || Boolean(data.electronicAddress), {
  message: "Enter the electronic address",
  path: ["electronicAddress"],
});

export type SupplierInput = z.input<typeof supplierInputSchema>;
