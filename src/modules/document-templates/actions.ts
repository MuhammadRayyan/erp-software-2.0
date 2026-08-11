"use server";

import { requireModule } from "@/core/permissions/require-module";
import { saveInvoiceTemplate } from "./template-service";

export async function saveInvoiceTemplateAction(businessId: string, template: unknown) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };
  try { saveInvoiceTemplate(businessId, user.id, template); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Template could not be saved" }; }
}
