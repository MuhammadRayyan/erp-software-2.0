import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { documentTemplates } from "@/core/db/business-schema";
import { defaultSettings, templateSettingsSchema, type TemplateSettings } from "./template-settings";

export function getTemplateSettings(businessId: string, userId: string, documentType: string = "sales-invoice"): TemplateSettings {
  const row = getBusinessDb(businessId, userId).db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.documentType, documentType))
    .get();

  if (!row || !row.settingsJson) return defaultSettings;

  try {
    return templateSettingsSchema.parse(JSON.parse(row.settingsJson));
  } catch {
    return defaultSettings;
  }
}

export function saveTemplateSettings(businessId: string, userId: string, documentType: string, settings: unknown) {
  const parsed = templateSettingsSchema.parse(settings);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(documentTemplates).where(eq(documentTemplates.documentType, documentType)).get();
  const now = new Date().toISOString();

  if (current) {
    context.db.update(documentTemplates)
      .set({ settingsJson: JSON.stringify(parsed), customHtml: parsed.customHtml, updatedAt: now })
      .where(eq(documentTemplates.id, current.id))
      .run();
  } else {
    context.db.insert(documentTemplates)
      .values({
        id: randomUUID(),
        documentType,
        name: documentType,
        templateJson: JSON.stringify(parsed),  // keep for backward compat until full migration
        settingsJson: JSON.stringify(parsed),
        customHtml: parsed.customHtml,
        updatedAt: now,
      })
      .run();
  }
}
