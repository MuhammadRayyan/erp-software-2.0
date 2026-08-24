import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { customers } from "@/core/db/business-schema";
import { saveCustomFieldValuesInTransaction } from "@/modules/custom-fields/custom-field-service";
import { customerInputSchema, type CustomerInput } from "./customer-input";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";

export function listCustomers(businessId: string, userId: string, includeInactive = false) {
  const db = getBusinessDb(businessId, userId).db;
  return db
    .select()
    .from(customers)
    .where(includeInactive ? undefined : eq(customers.isActive, true))
    .orderBy(asc(customers.name))
    .all();
}

/** Filters accepted by the paginated customer list. Currently only `includeInactive`, but
 *  shaped as an object so future filters (search term, status) can be added without
 *  breaking the call signature. */
export type CustomerListFilters = {
  /** When true, inactive customers are included in the result set. */
  includeInactive?: boolean;
  /** Maximum rows to return (server-side LIMIT). */
  take?: number;
  /** Number of rows to skip (server-side OFFSET). */
  skip?: number;
};

/** Result of `listCustomersPaginated`. The `rows` slice is just the rows for the requested
 *  page; `total` is the unfiltered-over-rows count for the same filters (so the UI can
 *  render "Page X of Y"). */
export type PaginatedCustomers = {
  rows: ReturnType<typeof listCustomers>;
  total: number;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

const DEFAULT_CUSTOMER_PAGE_SIZE = 50;
const MAX_CUSTOMER_PAGE_SIZE = 200;

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

/**
 * Count customers matching `filters` using the same `includeInactive` flag as
 * `listCustomers`. Returns the row count used by `listCustomersPaginated` to
 * compute total pages. Uses the raw sqlite handle directly because the count
 * query is trivial and avoids a Drizzle COUNT builder round-trip.
 */
function countCustomers(businessId: string, userId: string, filters?: CustomerListFilters): number {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where = filters?.includeInactive ? "" : "WHERE is_active = 1";
  const row = sqlite.prepare(`SELECT COUNT(*) AS total FROM customers ${where}`).get() as { total: number };
  return row.total;
}

/**
 * Paginated customer list for the list page. Server-side LIMIT/OFFSET keeps the
 * query cheap as the customer table grows past thousands of rows. The returned
 * `total` is the count for the same `filters` excluding the page bounds — the
 * UI uses it to render "Page X of Y" and disable the Next button on the last
 * page. Page is clamped to the last valid page so out-of-range URLs (e.g.
 * `?page=999`) still render the last page rather than 0 rows.
 *
 * @param page 1-indexed page number (clamped to >= 1).
 * @param pageSize rows per page (defaults to 50, capped at 200).
 */
export function listCustomersPaginated(
  businessId: string,
  userId: string,
  filters: CustomerListFilters & { page?: number; pageSize?: number } = {},
): PaginatedCustomers {
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_CUSTOMER_PAGE_SIZE, MAX_CUSTOMER_PAGE_SIZE);
  const total = countCustomers(businessId, userId, filters);
  // Clamp the page number to the last valid page so out-of-range URLs
  // (e.g. `?page=999`) still render the last page rather than 0 rows.
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;
  const db = getBusinessDb(businessId, userId).db;
  const rows = db
    .select()
    .from(customers)
    .where(filters.includeInactive ? undefined : eq(customers.isActive, true))
    .orderBy(asc(customers.name))
    .limit(pageSize)
    .offset(offset)
    .all();
  return { rows, total, page: effectivePage, pageSize, totalPages: maxPage };
}

export function getCustomer(businessId: string, userId: string, customerId: string) {
  return getBusinessDb(businessId, userId).db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .get();
}

export function createCustomer(
  businessId: string,
  userId: string,
  input: CustomerInput,
  customFieldValues?: Record<string, string>,
) {
  const data = customerInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const now = new Date().toISOString();
  const id = randomUUID();
  const insertCustomer = () =>
    context.db
      .insert(customers)
      .values({ id, ...data, defaultCurrencyCode, createdAt: now, updatedAt: now })
      .run();
  if (!customFieldValues) {
    insertCustomer();
    return id;
  }
  // The drizzle handle and the raw sqlite handle share one connection, so the
  // customer row and its custom field values are saved atomically.
  context.sqlite.transaction(() => {
    insertCustomer();
    saveCustomFieldValuesInTransaction(context.sqlite, "customer", id, customFieldValues);
  }).immediate();
  return id;
}

export function updateCustomer(
  businessId: string,
  userId: string,
  customerId: string,
  input: CustomerInput,
  customFieldValues?: Record<string, string>,
) {
  const data = customerInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const current = getCustomer(businessId, userId, customerId);
  if (!current) throw new Error("CUSTOMER_NOT_FOUND");
  const updateCustomerRow = () =>
    context.db
      .update(customers)
      .set({ ...data, defaultCurrencyCode, updatedAt: new Date().toISOString() })
      .where(eq(customers.id, customerId))
      .run();
  if (!customFieldValues) {
    updateCustomerRow();
    return;
  }
  context.sqlite.transaction(() => {
    updateCustomerRow();
    saveCustomFieldValuesInTransaction(context.sqlite, "customer", customerId, customFieldValues);
  }).immediate();
}
