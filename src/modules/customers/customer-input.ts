import { z } from "zod";
import {
  defaultCurrencyCodeSchema,
  trnSchema,
  legalRegistrationIdentifierSchema,
  electronicAddressSchema,
  electronicAddressSchemeSchema,
  phoneSchema,
} from "@/core/validation/party-schemas";

export const customerInputSchema = z.object({
  defaultCurrencyCode: defaultCurrencyCodeSchema,
  name: z.string().trim().min(2, "Enter a customer name").max(100),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).optional().default(""),
  phone: phoneSchema,
  taxReference: z.string().trim().max(50).optional().default(""),
  legalName: z.string().trim().max(160).optional().default(""),
  trn: trnSchema,
  legalRegistrationIdentifier: legalRegistrationIdentifierSchema,
  electronicAddress: electronicAddressSchema,
  electronicAddressScheme: electronicAddressSchemeSchema,
  addressLine1: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  countrySubdivision: z.string().trim().max(20).optional().default(""),
  countryCode: z.union([z.literal(""), z.string().trim().length(2).toUpperCase()]).optional().default(""),
  buyerReference: z.string().trim().max(80).optional().default(""),
  billingAddress: z.string().trim().max(1000).optional().default(""),
  deliveryAddress: z.string().trim().max(1000).optional().default(""),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional().default(0),
  creditLimitMinor: z.union([z.coerce.number().int().min(0), z.literal("")]).optional().transform(v => v === "" ? null : v),
  isActive: z.boolean().default(true),
});

export type CustomerInput = z.input<typeof customerInputSchema>;
