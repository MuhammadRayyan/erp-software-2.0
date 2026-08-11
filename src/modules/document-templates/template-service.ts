import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { documentTemplates } from "@/core/db/business-schema";
import { defaultInvoiceTemplate } from "./default-invoice-template";
import {
  type DocumentTemplate,
  validateDocumentTemplate,
} from "./pdf-engine";

export function getInvoiceTemplate(businessId: string, userId: string): DocumentTemplate {
  const row = getBusinessDb(businessId, userId).db.select().from(documentTemplates).where(eq(documentTemplates.documentType, "sales-invoice")).get();
  if (!row) return structuredClone(defaultInvoiceTemplate);
  return validateDocumentTemplate(JSON.parse(row.templateJson));
}

export function saveInvoiceTemplate(businessId: string, userId: string, value: unknown) {
  const template = validateDocumentTemplate(value);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(documentTemplates).where(eq(documentTemplates.documentType, "sales-invoice")).get();
  const now = new Date().toISOString();
  if (current) context.db.update(documentTemplates).set({ templateJson: JSON.stringify(template), updatedAt: now }).where(eq(documentTemplates.id, current.id)).run();
  else context.db.insert(documentTemplates).values({ id: randomUUID(), documentType: "sales-invoice", name: "Invoice", templateJson: JSON.stringify(template), updatedAt: now }).run();
}
