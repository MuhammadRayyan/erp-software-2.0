import { z } from "zod";

export const defaultCurrencyCodeSchema = z.union([z.literal(""), z.string().trim().length(3).transform((value) => value.toUpperCase())]).optional().default("");
export const trnSchema = z.union([z.literal(""), z.string().trim().regex(/^1\d{12}03$/, "TRN must be 15 digits, begin with 1, and end with 03")]).optional().default("");
export const legalRegistrationIdentifierSchema = z.string().trim().max(80).optional().default("");
export const electronicAddressSchema = z.string().trim().max(80).optional().default("");
export const electronicAddressSchemeSchema = z.string().trim().max(10).optional().default("");

export const phoneSchema = z.union([
  z.literal(""),
  z.string()
    .trim()
    .max(30, "Phone number cannot exceed 30 characters")
    .refine((val) => {
      if (!/^\+?[0-9\s\-().]{7,30}$/.test(val)) return false;
      const digits = val.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    }, {
      message: "Enter a valid phone number (7-15 digits, e.g. +971 50 123 4567)",
    }),
]).optional().default("");
