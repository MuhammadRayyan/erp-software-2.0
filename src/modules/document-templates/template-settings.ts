import { z } from "zod";

export const templateSettingsSchema = z.object({
  templateType: z.enum(["modern", "classic", "custom-html"]).default("modern"),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#356fd0"),
  fontName: z.enum(["Inter", "Roboto", "Open Sans", "Lato"]).default("Inter"),
  headerText: z.string().max(200).optional().default(""),
  footerText: z.string().max(200).optional().default("Thank you for your business"),
  showProjectColumn: z.boolean().default(false),
  showTaxColumn: z.boolean().default(true),
  showCustomerTrn: z.boolean().default(false),
  showPaymentTerms: z.boolean().default(false),
  customHtml: z.string().max(50000).optional().default(""),
});

export type TemplateSettings = z.infer<typeof templateSettingsSchema>;

export const defaultSettings: TemplateSettings = {
  templateType: "modern",
  logoUrl: null,
  primaryColor: "#356fd0",
  fontName: "Inter",
  headerText: "",
  footerText: "Thank you for your business",
  showProjectColumn: false,
  showTaxColumn: true,
  showCustomerTrn: false,
  showPaymentTerms: false,
  customHtml: "",
};
