import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { randomUUID } from "node:crypto";

export * from "./email-template-types";
import {
  type EmailTemplate,
  SUPPORTED_TEMPLATE_TYPES,
  DEFAULT_TEMPLATES,
} from "./email-template-types";

export function listEmailTemplates(businessId: string): EmailTemplate[] {
  const { sqlite } = getBusinessDb(businessId);
  return sqlite
    .prepare(
      `SELECT id, document_type, name, subject, body, created_at, updated_at
       FROM email_templates
       ORDER BY name ASC`
    )
    .all() as EmailTemplate[];
}

export function getEmailTemplate(businessId: string, documentType: string): EmailTemplate | null {
  const { sqlite } = getBusinessDb(businessId);
  const snake = documentType.replace(/-/g, "_");
  const kebab = documentType.replace(/_/g, "-");
  return (
    (sqlite
      .prepare(
        `SELECT id, document_type, name, subject, body, created_at, updated_at
         FROM email_templates
         WHERE document_type = ? OR document_type = ?`
      )
      .get(snake, kebab) as EmailTemplate | undefined) ?? null
  );
}

export function saveEmailTemplate(
  businessId: string, userId: string,
  documentType: string,
  input: { subject: string; body: string; name?: string }
): EmailTemplate {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const existing = getEmailTemplate(businessId, documentType);
  const def = SUPPORTED_TEMPLATE_TYPES.find((t) => t.type === documentType || t.type === documentType.replace(/-/g, "_"));
  const name = input.name || def?.name || documentType;
  const now = new Date().toISOString();

  if (existing) {
    sqlite.prepare(
      `UPDATE email_templates
       SET subject = ?, body = ?, name = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.subject, input.body, name, now, existing.id);
    return getEmailTemplate(businessId, documentType)!;
  } else {
    const id = randomUUID();
    const docType = documentType.replace(/-/g, "_");
    sqlite.prepare(
      `INSERT INTO email_templates (id, document_type, name, subject, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, docType, name, input.subject, input.body, now, now);
    return getEmailTemplate(businessId, documentType)!;
  }
}

export function resetEmailTemplate(businessId: string, userId: string, documentType: string): EmailTemplate {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const defaults =
    DEFAULT_TEMPLATES[documentType] ||
    DEFAULT_TEMPLATES[documentType.replace(/_/g, "-")] ||
    DEFAULT_TEMPLATES[documentType.replace(/-/g, "_")] || {
      subject: `Document {{document_number}} from {{business_name}}`,
      body: `Hello {{customer_name}},\n\nPlease find document {{document_number}} attached.\n\nBest regards,\n{{business_name}}`,
    };
  const def = SUPPORTED_TEMPLATE_TYPES.find((t) => t.type === documentType || t.type === documentType.replace(/-/g, "_"));
  return saveEmailTemplate(businessId, userId, documentType, {
    subject: defaults.subject,
    body: defaults.body,
    name: def?.name || documentType,
  });
}

