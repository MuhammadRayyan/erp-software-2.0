import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { formDefaults } from "@/core/db/business-schema";

/**
 * The shape of stored form defaults. All fields optional — a form falls
 * back to its own built-in defaults when a field isn't configured.
 */
export type FormDefaultValues = {
  /** Whether line amounts entered by the user include tax (VAT-inclusive pricing). */
  amountsIncludeTax?: boolean;
  /** Show a per-line discount column on the form. */
  showDiscounts?: boolean;
  /** Show a line-number column on the form. */
  showLineNumber?: boolean;
  /** Show a per-line description column. */
  showDescription?: boolean;
  /** Default tax code id applied to new lines. */
  defaultTaxCodeId?: string;
  /** Default sales/expense account id applied to new lines (sales docs). */
  defaultSalesAccountId?: string;
  /** Default expense account id applied to new lines (purchase docs). */
  defaultExpenseAccountId?: string;
  /** Default notes text pre-filled on new documents. */
  defaultNotes?: string;
  /** Default terms text pre-filled on new documents. */
  defaultTerms?: string;
};

export const FORM_TYPES = [
  "sales-quote",
  "sales-order",
  "sales-invoice",
  "sales-credit-note",
  "purchase-order",
  "purchase-invoice",
  "debit-note",
] as const;

export type FormType = (typeof FORM_TYPES)[number];

export function isFormType(value: string): value is FormType {
  return (FORM_TYPES as readonly string[]).includes(value);
}

/** Get form defaults for a document type, or empty object if not configured. */
export function getFormDefaults(businessId: string, userId: string, formType: string): FormDefaultValues {
  const { db } = getBusinessDb(businessId, userId);
  const row = db.select().from(formDefaults).where(eq(formDefaults.formType, formType)).get();
  if (!row) return {};
  try {
    return JSON.parse(row.payloadJson) as FormDefaultValues;
  } catch {
    return {};
  }
}

/** Save (upsert) form defaults for a document type. */
export function saveFormDefaults(
  businessId: string,
  userId: string,
  formType: string,
  values: FormDefaultValues,
): void {
  const { db, sqlite } = getBusinessDb(businessId, userId);
  const payloadJson = JSON.stringify(values);
  const now = new Date().toISOString();
  const existing = db.select().from(formDefaults).where(eq(formDefaults.formType, formType)).get();
  if (existing) {
    sqlite
      .prepare("UPDATE form_defaults SET payload_json = ?, updated_at = ? WHERE form_type = ?")
      .run(payloadJson, now, formType);
  } else {
    sqlite
      .prepare("INSERT INTO form_defaults (id, form_type, payload_json, updated_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), formType, payloadJson, now);
  }
}
