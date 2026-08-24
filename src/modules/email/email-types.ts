import type { SentEmailRelatedEntityType, SentEmailStatus } from "@/core/db/business-schema";

export type { SentEmailRelatedEntityType, SentEmailStatus };

export interface EmailRecipient {
  /** Display name (optional). */
  name?: string;
  /** Email address (required, lower-cased). */
  email: string;
}

export interface EmailAttachment {
  /** Filename shown to the recipient, e.g. "INV-00009.pdf". */
  filename: string;
  /** MIME type, defaults to application/pdf. */
  contentType?: string;
  /** Raw attachment bytes. */
  data: Uint8Array | Buffer;
}

export interface SendEmailInput {
  /** Sender address — defaults to the business sender identity. */
  from: EmailRecipient;
  /** Primary recipients. */
  to: EmailRecipient[];
  /** Carbon-copy recipients (optional). */
  cc?: EmailRecipient[];
  /** Subject line. */
  subject: string;
  /** HTML body — rendered into the email body. */
  bodyHtml: string;
  /** Plain-text fallback body (optional). */
  bodyText?: string;
  /** File attachments (optional). */
  attachments?: EmailAttachment[];
  /** Related entity (optional) for audit-log linking. */
  relatedEntityType?: SentEmailRelatedEntityType;
  relatedEntityId?: string;
  relatedDocumentNumber?: string;
}

export interface SendEmailResult {
  /** Generated UUID for the sent_emails row. */
  id: string;
  /** Generated RFC-2392 Message-ID value. */
  messageId: string;
  /** Final delivery status (sent/failed). */
  status: SentEmailStatus;
  /** Provider error message if status === "failed". */
  errorMessage?: string;
}

export interface SentEmailRow {
  id: string;
  messageId: string;
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  status: SentEmailStatus;
  relatedEntityType: SentEmailRelatedEntityType | null;
  relatedEntityId: string | null;
  relatedDocumentNumber: string | null;
  attachmentFilename: string | null;
  attachmentSizeBytes: number | null;
  sentAt: string | null;
  errorMessage: string | null;
  createdBy: string;
  createdAt: string;
}

/**
 * Driver interface — pluggable so production deployments can swap in a real
 * SMTP/Nodemailer driver without touching the service layer. The default
 * `LogDriver` records the email to the sent_emails audit table and returns
 * `status: "sent"` (simulated success — no transport in the demo env).
 */
export interface EmailDriver {
  readonly name: string;
  send(input: SendEmailInput): Promise<{ ok: true; messageId: string } | { ok: false; error: string }>;
}
