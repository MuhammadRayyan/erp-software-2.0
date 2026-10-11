import { getBusinessDb } from "@/core/db/business";
import { randomUUID } from "node:crypto";

export type PaymentTerm = {
  id: string;
  name: string;
  days: number;
  is_eom: number; // 0 or 1
  is_default: number; // 0 or 1
  is_active: number;
  created_at: string;
  updated_at: string;
};

export function listPaymentTerms(businessId: string): PaymentTerm[] {
  const { sqlite } = getBusinessDb(businessId);
  return sqlite
    .prepare(
      `SELECT id, name, days, is_eom, is_default, is_active, created_at, updated_at
       FROM payment_terms
       ORDER BY is_default DESC, days ASC, name ASC`
    )
    .all() as PaymentTerm[];
}

export function getPaymentTerm(businessId: string, id: string): PaymentTerm | null {
  const { sqlite } = getBusinessDb(businessId);
  return (
    (sqlite
      .prepare(
        `SELECT id, name, days, is_eom, is_default, is_active, created_at, updated_at
         FROM payment_terms
         WHERE id = ?`
      )
      .get(id) as PaymentTerm | undefined) ?? null
  );
}

export function getDefaultPaymentTerm(businessId: string): PaymentTerm | null {
  const { sqlite } = getBusinessDb(businessId);
  return (
    (sqlite
      .prepare(
        `SELECT id, name, days, is_eom, is_default, is_active, created_at, updated_at
         FROM payment_terms
         WHERE is_default = 1
         LIMIT 1`
      )
      .get() as PaymentTerm | undefined) ?? null
  );
}

export function createPaymentTerm(
  businessId: string,
  input: {
    name: string;
    days?: number;
    days_count?: number;
    is_eom?: boolean | number;
    term_type?: "days_after_invoice" | "end_of_month";
    is_default?: boolean;
  }
): PaymentTerm {
  const { sqlite } = getBusinessDb(businessId);
  const id = randomUUID();
  const name = input.name.trim();
  const days = Math.max(0, input.days ?? input.days_count ?? 0);
  const isEom = input.is_eom === 1 || input.is_eom === true || input.term_type === "end_of_month" ? 1 : 0;
  const isDefault = input.is_default ? 1 : 0;
  const now = new Date().toISOString();

  if (!name) {
    throw new Error("Payment term name is required.");
  }

  const tx = sqlite.transaction(() => {
    if (isDefault === 1) {
      sqlite.prepare(`UPDATE payment_terms SET is_default = 0`).run();
    }

    sqlite.prepare(
      `INSERT INTO payment_terms (id, name, days, is_eom, is_default, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(id, name, days, isEom, isDefault, now, now);
  });

  tx();
  return getPaymentTerm(businessId, id)!;
}

export function updatePaymentTerm(
  businessId: string,
  id: string,
  input: {
    name: string;
    days?: number;
    days_count?: number;
    is_eom?: boolean | number;
    term_type?: "days_after_invoice" | "end_of_month";
    is_default?: boolean;
  }
): PaymentTerm {
  const { sqlite } = getBusinessDb(businessId);
  const existing = getPaymentTerm(businessId, id);
  if (!existing) {
    throw new Error("Payment term not found.");
  }

  const name = input.name.trim();
  const days = Math.max(0, input.days ?? input.days_count ?? 0);
  const isEom = input.is_eom === 1 || input.is_eom === true || input.term_type === "end_of_month" ? 1 : 0;
  const isDefault = input.is_default ? 1 : 0;
  const now = new Date().toISOString();

  if (!name) {
    throw new Error("Payment term name is required.");
  }

  const tx = sqlite.transaction(() => {
    if (isDefault === 1) {
      sqlite.prepare(`UPDATE payment_terms SET is_default = 0`).run();
    }

    sqlite.prepare(
      `UPDATE payment_terms
       SET name = ?, days = ?, is_eom = ?, is_default = ?, updated_at = ?
       WHERE id = ?`
    ).run(name, days, isEom, isDefault, now, id);
  });

  tx();
  return getPaymentTerm(businessId, id)!;
}

export function deletePaymentTerm(businessId: string, id: string): void {
  const { sqlite } = getBusinessDb(businessId);
  sqlite.prepare(`DELETE FROM payment_terms WHERE id = ?`).run(id);
}

export function setDefaultPaymentTerm(businessId: string, id: string): void {
  const { sqlite } = getBusinessDb(businessId);
  const tx = sqlite.transaction(() => {
    sqlite.prepare(`UPDATE payment_terms SET is_default = 0`).run();
    sqlite.prepare(`UPDATE payment_terms SET is_default = 1 WHERE id = ?`).run(id);
  });
  tx();
}

/**
 * Calculates due date based on issue date and payment term definition.
 */
export function calculateDueDate(
  issueDateStr: string,
  term: { days?: number; days_count?: number; is_eom?: boolean | number; term_type?: string }
): string {
  if (!issueDateStr) return "";
  const parts = issueDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return issueDateStr;
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(d.getTime())) return issueDateStr;

  const isEom = term.is_eom === 1 || term.is_eom === true || term.term_type === "end_of_month";
  const days = term.days ?? term.days_count ?? 0;

  if (isEom) {
    // Last day of current month: month is 1-indexed here, so passing month to Date.UTC(year, month, 0) gives last day of month
    const lastDay = new Date(Date.UTC(year, month, 0));
    if (days > 0) {
      lastDay.setUTCDate(lastDay.getUTCDate() + days);
    }
    return lastDay.toISOString().slice(0, 10);
  } else {
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
