import { z } from "zod";

export const defaultCurrencyCodeSchema = z.union([z.literal(""), z.string().trim().length(3).transform((value) => value.toUpperCase())]).optional().default("");
export const trnSchema = z.union([z.literal(""), z.string().trim().regex(/^1\d{12}03$/, "TRN must be 15 digits, begin with 1, and end with 03")]).optional().default("");
export const legalRegistrationIdentifierSchema = z.string().trim().max(80).optional().default("");
export const electronicAddressSchema = z.string().trim().max(80).optional().default("");
export const electronicAddressSchemeSchema = z.string().trim().max(10).optional().default("");

