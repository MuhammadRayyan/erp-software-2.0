import { z } from "zod";
import { phoneSchema } from "@/core/validation/party-schemas";

export const businessProfileInputSchema = z.object({
  legalName: z.string().trim().max(150).optional().default(""),
  tradingName: z.string().trim().max(150).optional().default(""),
  companyRegistrationNumber: z.string().trim().max(100).optional().default(""),
  taxId: z.string().trim().max(50).optional().default(""),
  email: z.string().trim().max(150).optional().default(""),
  phone: phoneSchema,
  website: z.string().trim().max(200).optional().default(""),
  addressLine1: z.string().trim().max(255).optional().default(""),
  addressLine2: z.string().trim().max(255).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  stateOrEmirate: z.string().trim().max(100).optional().default(""),
  postalCode: z.string().trim().max(50).optional().default(""),
  country: z.string().trim().max(100).optional().default("United Arab Emirates"),
  countryCode: z.string().trim().max(10).optional().default("AE"),
  logoUrl: z.string().trim().max(2000).optional().default(""),
});

export type BusinessProfileInput = z.infer<typeof businessProfileInputSchema>;

export const localizationInputSchema = z.object({
  dateFormat: z.enum(["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD MMM YYYY"]).default("DD/MM/YYYY"),
  timeFormat: z.enum(["12h", "24h"]).default("12h"),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12).default(1),
});

export type LocalizationInput = z.infer<typeof localizationInputSchema>;
