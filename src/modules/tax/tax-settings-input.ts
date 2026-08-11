import { z } from "zod";
import { emirates } from "./uae-vat-config";

const optionalDate = z.union([z.literal(""), z.iso.date()]).optional().default("");
const optionalEmirate = z.union([z.literal(""), z.enum(emirates)]).optional().default("");

export const taxSettingsInputSchema = z.object({
  vatRegistered: z.boolean().default(false),
  trn: z.string().trim().max(30).optional().default(""),
  vatRegistrationEffectiveDate: optionalDate,
  vatDeregistrationDate: optionalDate,
  defaultSupplyEmirate: optionalEmirate,
}).superRefine((data, context) => {
  if (data.vatRegistered && !data.trn) {
    context.addIssue({ code: "custom", path: ["trn"], message: "Enter the business TRN." });
  }
  if (data.vatRegistered && !data.vatRegistrationEffectiveDate) {
    context.addIssue({ code: "custom", path: ["vatRegistrationEffectiveDate"], message: "Enter the VAT registration effective date." });
  }
  if (data.vatRegistered && !data.defaultSupplyEmirate) {
    context.addIssue({ code: "custom", path: ["defaultSupplyEmirate"], message: "Choose the default supply Emirate." });
  }
  if (data.vatDeregistrationDate && data.vatRegistrationEffectiveDate &&
      data.vatDeregistrationDate < data.vatRegistrationEffectiveDate) {
    context.addIssue({ code: "custom", path: ["vatDeregistrationDate"], message: "Deregistration cannot precede registration." });
  }
});

export type TaxSettingsInput = z.input<typeof taxSettingsInputSchema>;

