import { z } from "zod";

export const customerInputSchema = z.object({
  defaultCurrencyCode: z.union([z.literal(""), z.string().trim().length(3).transform((value) => value.toUpperCase())]).optional().default(""),
  name: z.string().trim().min(2, "Enter a customer name").max(100),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).optional().default(""),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9]+$/, "Phone must contain only numbers and an optional '+' sign").max(40)]).optional().default(""),
  taxReference: z.string().trim().max(50).optional().default(""),
  legalName: z.string().trim().max(160).optional().default(""),
  trn: z.union([z.literal(""), z.string().trim().regex(/^1\d{12}03$/, "TRN must be 15 digits, begin with 1, and end with 03")]).optional().default(""),
  legalRegistrationIdentifier: z.string().trim().max(80).optional().default(""),
  electronicAddress: z.string().trim().max(80).optional().default(""),
  electronicAddressScheme: z.string().trim().max(10).optional().default(""),
  addressLine1: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  countrySubdivision: z.string().trim().max(20).optional().default(""),
  countryCode: z.union([z.literal(""), z.string().trim().length(2).toUpperCase()]).optional().default(""),
  buyerReference: z.string().trim().max(80).optional().default(""),
  billingAddress: z.string().trim().max(1000).optional().default(""),
  deliveryAddress: z.string().trim().max(1000).optional().default(""),
  isActive: z.boolean().default(true),
});

export type CustomerInput = z.input<typeof customerInputSchema>;
