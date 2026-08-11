import { z } from "zod";
import { PINT_AE_SPECIFICATION_VERSION } from "./einvoice-types";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const eInvoiceSettingsInputSchema = z.object({
  enabled: z.boolean().optional().default(false),
  legalName: optionalText(160),
  legalRegistrationIdentifier: optionalText(80),
  addressLine1: optionalText(160),
  city: optionalText(80),
  countrySubdivision: optionalText(20),
  countryCode: z.string().trim().length(2).toUpperCase().optional().default("AE"),
  participantIdentifier: optionalText(80),
  participantIdentifierScheme: optionalText(10),
  endpointIdentifier: optionalText(80),
  endpointIdentifierScheme: optionalText(10),
  aspProviderKey: z.enum(["", "mock"]).optional().default(""),
  aspEnvironment: z.enum(["disabled", "mock"]).optional().default("disabled"),
  specificationVersion: z.literal(PINT_AE_SPECIFICATION_VERSION).optional().default(PINT_AE_SPECIFICATION_VERSION),
}).superRefine((value, context) => {
  if (value.aspEnvironment === "mock" && value.aspProviderKey !== "mock") {
    context.addIssue({ code: "custom", path: ["aspProviderKey"], message: "Choose the Mock provider for the Mock environment" });
  }
  if (value.aspEnvironment === "disabled" && value.aspProviderKey) {
    context.addIssue({ code: "custom", path: ["aspProviderKey"], message: "Clear the provider while submission is disabled" });
  }
});

export type EInvoiceSettingsInput = z.input<typeof eInvoiceSettingsInputSchema>;
