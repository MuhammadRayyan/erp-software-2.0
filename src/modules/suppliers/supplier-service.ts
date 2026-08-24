import { cache } from "react";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { suppliers } from "@/core/db/business-schema";
import { saveCustomFieldValuesInTransaction } from "@/modules/custom-fields/custom-field-service";
import { supplierInputSchema, type SupplierInput } from "./supplier-input";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";

export function listSuppliers(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT s.*,
      COALESCE((SELECT SUM(base_total_minor) FROM purchase_invoices pi
        WHERE pi.supplier_id = s.id AND pi.document_status = 'posted'), 0) AS total_purchased_minor,
      COALESCE((SELECT SUM(released_carrying_amount_minor) FROM supplier_payments sp
        WHERE sp.supplier_id = s.id AND sp.document_status = 'posted'), 0) AS total_paid_minor
    FROM suppliers s
    ORDER BY s.name
  `).all() as {
    id: string; name: string; email: string | null; phone: string | null;
    tax_reference: string | null; address: string | null; notes: string | null;
    is_active: number; created_at: string; updated_at: string;
    total_purchased_minor: number; total_paid_minor: number;
  }[];
}

/** Result of `listSuppliersPaginated`. The `rows` slice is just the rows for the
 *  requested page; `total` is the supplier count used to compute "Page X of Y".
 *  Row shape matches `listSuppliers` so callers can switch between them freely. */
export type PaginatedSuppliers = {
  rows: ReturnType<typeof listSuppliers>;
  total: number;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

const DEFAULT_SUPPLIER_PAGE_SIZE = 50;
const MAX_SUPPLIER_PAGE_SIZE = 200;

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

/**
 * Paginated supplier list for the list page. Server-side LIMIT/OFFSET keeps the
 * query cheap as the supplier table grows past thousands of rows. The returned
 * `total` is the supplier count regardless of the page bounds — the UI uses it
 * to render "Page X of Y" and disable the Next button on the last page. Page is
 * clamped to the last valid page so out-of-range URLs (e.g. `?page=999`) still
 * render the last page rather than 0 rows.
 *
 * @param page 1-indexed page number (clamped to >= 1).
 * @param pageSize rows per page (defaults to 50, capped at 200).
 */
export function listSuppliersPaginated(
  businessId: string,
  userId: string,
  filters: { page?: number; pageSize?: number } = {},
): PaginatedSuppliers {
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_SUPPLIER_PAGE_SIZE, MAX_SUPPLIER_PAGE_SIZE);
  const { sqlite } = getBusinessDb(businessId, userId);
  const totalRow = sqlite.prepare(`SELECT COUNT(*) AS total FROM suppliers`).get() as { total: number };
  const total = totalRow.total;
  // Clamp the page number to the last valid page so out-of-range URLs
  // (e.g. `?page=999`) still render the last page rather than 0 rows.
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;
  const rows = sqlite.prepare(`
    SELECT s.*,
      COALESCE((SELECT SUM(base_total_minor) FROM purchase_invoices pi
        WHERE pi.supplier_id = s.id AND pi.document_status = 'posted'), 0) AS total_purchased_minor,
      COALESCE((SELECT SUM(released_carrying_amount_minor) FROM supplier_payments sp
        WHERE sp.supplier_id = s.id AND sp.document_status = 'posted'), 0) AS total_paid_minor
    FROM suppliers s
    ORDER BY s.name
    LIMIT ? OFFSET ?
  `).all(pageSize, offset) as {
    id: string; name: string; email: string | null; phone: string | null;
    tax_reference: string | null; address: string | null; notes: string | null;
    is_active: number; created_at: string; updated_at: string;
    total_purchased_minor: number; total_paid_minor: number;
  }[];
  return { rows, total, page: effectivePage, pageSize, totalPages: maxPage };
}

export function getSupplier(businessId: string, userId: string, supplierId: string) {
  return getBusinessDb(businessId, userId).db.select().from(suppliers)
    .where(eq(suppliers.id, supplierId)).get() ?? null;
}

export function createSupplier(
  businessId: string,
  userId: string,
  input: SupplierInput,
  customFieldValues?: Record<string, string>,
) {
  const data = supplierInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const id = randomUUID();
  const now = new Date().toISOString();
  const insertSupplier = () =>
    context.db.insert(suppliers).values({
      id,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      taxReference: data.taxReference || null,
      address: data.address || null,
      legalName: data.legalName || null,
      trn: data.trn || null,
      legalRegistrationIdentifier: data.legalRegistrationIdentifier || null,
      electronicAddress: data.electronicAddress || null,
      electronicAddressScheme: data.electronicAddressScheme || null,
      registeredAddress: data.registeredAddress || null,
      countryCode: data.countryCode || null,
      defaultCurrencyCode,
      notes: data.notes || null,
      isActive: data.isActive,
      createdAt: now,
      updatedAt: now,
    }).run();
  if (customFieldValues) {
    // The drizzle handle and the raw sqlite handle share one connection, so
    // the supplier row and its custom field values are saved atomically.
    context.sqlite.transaction(() => {
      insertSupplier();
      saveCustomFieldValuesInTransaction(context.sqlite, "supplier", id, customFieldValues);
    }).immediate();
  } else {
    insertSupplier();
  }
  return id;
}

export function updateSupplier(
  businessId: string,
  userId: string,
  supplierId: string,
  input: SupplierInput,
  customFieldValues?: Record<string, string>,
) {
  const data = supplierInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const current = context.db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!current) throw new Error("Supplier not found.");
  const updateSupplierRow = () =>
    context.db.update(suppliers).set({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      taxReference: data.taxReference || null,
      address: data.address || null,
      legalName: data.legalName || null,
      trn: data.trn || null,
      legalRegistrationIdentifier: data.legalRegistrationIdentifier || null,
      electronicAddress: data.electronicAddress || null,
      electronicAddressScheme: data.electronicAddressScheme || null,
      registeredAddress: data.registeredAddress || null,
      countryCode: data.countryCode || null,
      defaultCurrencyCode,
      notes: data.notes || null,
      isActive: data.isActive,
      updatedAt: new Date().toISOString(),
    }).where(eq(suppliers.id, supplierId)).run();
  if (customFieldValues) {
    context.sqlite.transaction(() => {
      updateSupplierRow();
      saveCustomFieldValuesInTransaction(context.sqlite, "supplier", supplierId, customFieldValues);
    }).immediate();
  } else {
    updateSupplierRow();
  }
}

export const listActiveSuppliers = cache((businessId: string, userId: string) => {
  return getBusinessDb(businessId, userId).db.select().from(suppliers)
    .where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)).all();
});
