import { z } from "zod";
import {
  defaultCurrencyCodeSchema,
  trnSchema,
  legalRegistrationIdentifierSchema,
  electronicAddressSchema,
  electronicAddressSchemeSchema,
} from "@/core/validation/party-schemas";

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address")]);

export const supplierInputSchema = z.object({
  defaultCurrencyCode: defaultCurrencyCodeSchema,
  name: z.string().trim().min(2, "Enter a supplier name").max(160),
  email: optionalEmail.optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
  taxReference: z.string().trim().max(100).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  legalName: z.string().trim().max(200).optional().default(""),
  trn: trnSchema,
  legalRegistrationIdentifier: legalRegistrationIdentifierSchema,
  electronicAddress: electronicAddressSchema,
  electronicAddressScheme: electronicAddressSchemeSchema,
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
