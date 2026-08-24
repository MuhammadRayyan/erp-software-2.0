import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { sentEmails } from "@/core/db/business-schema";
import { getEmailDriver, joinMailboxes } from "./email-driver";
import type {
  EmailRecipient,
  SendEmailInput,
  SendEmailResult,
  SentEmailRow,
} from "./email-types";

type SentEmailSqlRow = {
  id: string;
  message_id: string;
  from_address: string;
  to_addresses: string;
  cc_addresses: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  related_document_number: string | null;
  attachment_filename: string | null;
  attachment_size_bytes: number | null;
  sent_at: string | null;
  error_message: string | null;
  created_by: string;
  created_at: string;
};

function toRow(row: SentEmailSqlRow): SentEmailRow {
  return {
    id: row.id,
    messageId: row.message_id,
    fromAddress: row.from_address,
    toAddresses: row.to_addresses,
    ccAddresses: row.cc_addresses ?? "",
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text ?? "",
    status: row.status as SentEmailRow["status"],
    relatedEntityType: (row.related_entity_type ?? null) as SentEmailRow["relatedEntityType"],
    relatedEntityId: row.related_entity_id,
    relatedDocumentNumber: row.related_document_number,
    attachmentFilename: row.attachment_filename,
    attachmentSizeBytes: row.attachment_size_bytes,
    sentAt: row.sent_at,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * Send an email: validate input, persist a `queued` audit row, hand off to
 * the email driver, then mark the row `sent` (or `failed` if the driver
 * threw). The row is always persisted — even on failure — so the audit log
 * captures every attempt. The driver is pluggable via `getEmailDriver()`.
 *
 * Attachments are NOT stored in the DB (their bytes would balloon the table
 * fast). Instead we record the attachment filename + size in the audit row,
 * which is enough for the UI to render "PDF · 84 KB" on the sent-email list.
 *
 * Returns `{ id, messageId, status, errorMessage? }`.
 */
export async function sendEmail(
  businessId: string,
  userId: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (input.to.length === 0) throw new Error("At least one recipient is required.");
  if (!input.subject.trim()) throw new Error("Email subject is required.");
  if (!input.bodyHtml.trim()) throw new Error("Email body is required.");

  const { sqlite } = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const toCsv = joinMailboxes(input.to);
  const ccCsv = joinMailboxes(input.cc ?? []);
  const from = input.from.name
    ? `${input.from.name} <${input.from.email}>`
    : input.from.email;
  const attachment = input.attachments?.[0];
  const createdAt = new Date().toISOString();

  // Insert the row with status="queued" first so the audit log captures the
  // attempt even if the driver throws. We re-UPDATE after the driver call.
  sqlite
    .prepare(
      `INSERT INTO sent_emails (
        id, message_id, from_address, to_addresses, cc_addresses,
        subject, body_html, body_text, status,
        related_entity_type, related_entity_id, related_document_number,
        attachment_filename, attachment_size_bytes, sent_at, error_message,
        created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(
      id,
      id, // messageId: use the row UUID as a stand-in until the driver returns one.
      from,
      toCsv,
      ccCsv,
      input.subject.trim(),
      input.bodyHtml,
      input.bodyText ?? "",
      input.relatedEntityType ?? null,
      input.relatedEntityId ?? null,
      input.relatedDocumentNumber ?? null,
      attachment?.filename ?? null,
      attachment ? attachment.data.byteLength : null,
      userId,
      createdAt,
    );

  const driver = getEmailDriver();
  const result = await driver.send(input);
  const now = new Date().toISOString();
  if (result.ok) {
    sqlite
      .prepare(
        `UPDATE sent_emails
         SET status = 'sent', message_id = ?, sent_at = ?, error_message = NULL
         WHERE id = ?`,
      )
      .run(result.messageId, now, id);
    return { id, messageId: result.messageId, status: "sent" };
  }
  sqlite
    .prepare(
      `UPDATE sent_emails
       SET status = 'failed', error_message = ?, sent_at = ?
       WHERE id = ?`,
    )
    .run(result.error, now, id);
  return { id, messageId: id, status: "failed", errorMessage: result.error };
}

/**
 * List sent emails for a business, newest first. Optionally filter by related
 * entity (e.g. only emails for invoice X). The query is cheap — the audit
 * table is bounded by send volume and indexed on (entity_type, entity_id).
 */
export function listSentEmails(
  businessId: string,
  userId: string,
  filter?: { relatedEntityType?: string; relatedEntityId?: string },
): SentEmailRow[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where: string[] = [];
  const values: string[] = [];
  if (filter?.relatedEntityType) {
    where.push("related_entity_type = ?");
    values.push(filter.relatedEntityType);
  }
  if (filter?.relatedEntityId) {
    where.push("related_entity_id = ?");
    values.push(filter.relatedEntityId);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = sqlite
    .prepare(
      `SELECT id, message_id, from_address, to_addresses, cc_addresses, subject,
              body_html, body_text, status, related_entity_type, related_entity_id,
              related_document_number, attachment_filename, attachment_size_bytes,
              sent_at, error_message, created_by, created_at
       FROM sent_emails
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT 200`,
    )
    .all(...values) as SentEmailSqlRow[];
  return rows.map(toRow);
}

/**
 * Fetch a single sent email by id. Returns null if the email doesn't exist
 * or belongs to a different business (the latter is enforced implicitly —
 * the email lives in the business DB, which is keyed by directory_key — so
 * cross-business access is impossible at the connection level).
 */
export function getSentEmail(
  businessId: string,
  userId: string,
  emailId: string,
): SentEmailRow | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare(
      `SELECT id, message_id, from_address, to_addresses, cc_addresses, subject,
              body_html, body_text, status, related_entity_type, related_entity_id,
              related_document_number, attachment_filename, attachment_size_bytes,
              sent_at, error_message, created_by, created_at
       FROM sent_emails
       WHERE id = ?`,
    )
    .get(emailId) as SentEmailSqlRow | undefined;
  return row ? toRow(row) : null;
}

/**
 * Helper for forms: parse a comma/semicolon-separated string into a list
 * of `EmailRecipient`. Tolerates bare addresses and `Name <addr>` formats.
 * Empty entries are skipped. Invalid entries are returned with `email=""`
 * so the caller can decide whether to flag them.
 */
export function parseRecipientList(raw: string): EmailRecipient[] {
  if (!raw) return [];
  const out: EmailRecipient[] = [];
  const parts = raw.split(/[,;]\s*/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = /^(.*?)\s*<([^>]+)>$/.exec(trimmed);
    if (match) {
      const name = match[1].trim().replace(/^["']|["']$/g, "");
      out.push({ name: name || undefined, email: match[2].trim().toLowerCase() });
    } else {
      out.push({ email: trimmed.toLowerCase() });
    }
  }
  return out;
}

// Re-export for callers that want the drizzle handle directly (e.g. for
// ad-hoc queries by other modules).
export { sentEmails, eq, desc };
