import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { customers } from "@/core/db/business-schema";
import { saveCustomFieldValuesInTransaction } from "@/modules/custom-fields/custom-field-service";
import { customerInputSchema, type CustomerInput } from "./customer-input";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import type { ListSortDir } from "@/lib/list-query-params";
import {
  buildLikePattern,
  clampPositiveInt,
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
} from "@/modules/shared/list-query-helpers";

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
  /** When true, inactive customers are included unless `status` narrows further. */
  includeInactive?: boolean;
  q?: string;
  status?: "" | "active" | "inactive" | string;
  sort?: string;
  dir?: ListSortDir;
  /** Maximum rows to return (server-side LIMIT). */
  take?: number;
  /** Number of rows to skip (server-side OFFSET). */
  skip?: number;
};

export type DirectoryListSummary = {
  unfilteredTotal: number;
  filteredTotal: number;
  activeCount: number;
};

/** Result of `listCustomersPaginated`. The `rows` slice is just the rows for the requested
 *  page; `total` is the filtered count across the database. */
export type PaginatedCustomers = {
  rows: ReturnType<typeof listCustomers>;
  total: number;
  summary: DirectoryListSummary;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

/**
 * Paginated customer list with SQL filtering, sorting, and DB-wide counts.
 */
export function listCustomersPaginated(
  businessId: string,
  userId: string,
  filters: CustomerListFilters & { page?: number; pageSize?: number } = {},
): PaginatedCustomers {
  const { db, sqlite } = getBusinessDb(businessId, userId);
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);

  const drizzleConditions: SQL[] = [];
  const sqlConditions: string[] = [];
  const sqlValues: Array<string | number> = [];

  if (filters.status === "active" || (!filters.status && !filters.includeInactive)) {
    drizzleConditions.push(eq(customers.isActive, true));
    sqlConditions.push("is_active = 1");
  } else if (filters.status === "inactive") {
    drizzleConditions.push(eq(customers.isActive, false));
    sqlConditions.push("is_active = 0");
  }

  const likePattern = buildLikePattern(filters.q);
  if (likePattern) {
    const dLike = or(
      sql`lower(${customers.name}) LIKE ${likePattern} ESCAPE '\\'`,
      sql`lower(COALESCE(${customers.email}, '')) LIKE ${likePattern} ESCAPE '\\'`,
      sql`lower(COALESCE(${customers.phone}, '')) LIKE ${likePattern} ESCAPE '\\'`,
    );
    if (dLike) drizzleConditions.push(dLike);
    sqlConditions.push(
      "(lower(name) LIKE ? ESCAPE '\\' OR lower(COALESCE(email, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(phone, '')) LIKE ? ESCAPE '\\')",
    );
    sqlValues.push(likePattern, likePattern, likePattern);
  }

  const sqlWhere = sqlConditions.length ? `WHERE ${sqlConditions.join(" AND ")}` : "";
  const unfilteredRow = sqlite.prepare("SELECT COUNT(*) AS total FROM customers").get() as { total: number };
  const summaryRow = sqlite
    .prepare(
      `SELECT COUNT(*) AS filtered_total, COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active_count FROM customers ${sqlWhere}`,
    )
    .get(...sqlValues) as { filtered_total: number; active_count: number };

  const total = summaryRow.filtered_total;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;

  const isDesc = filters.dir === "desc";
  const sortOrder = (() => {
    switch (filters.sort) {
      case "email":
        return [isDesc ? desc(sql`lower(COALESCE(${customers.email}, ''))`) : asc(sql`lower(COALESCE(${customers.email}, ''))`), asc(customers.name)];
      case "phone":
        return [isDesc ? desc(sql`COALESCE(${customers.phone}, '')`) : asc(sql`COALESCE(${customers.phone}, '')`), asc(customers.name)];
      case "status":
        return [isDesc ? desc(customers.isActive) : asc(customers.isActive), asc(customers.name)];
      case "name":
      default:
        return [isDesc ? desc(customers.name) : asc(customers.name), asc(customers.id)];
    }
  })();

  const whereExpr = drizzleConditions.length ? and(...drizzleConditions) : undefined;
  const rows = db
    .select()
    .from(customers)
    .where(whereExpr)
    .orderBy(...sortOrder)
    .limit(pageSize)
    .offset(offset)
    .all();

  return {
    rows,
    total,
    summary: {
      unfilteredTotal: unfilteredRow.total,
      filteredTotal: total,
      activeCount: summaryRow.active_count,
    },
    page: effectivePage,
    pageSize,
    totalPages: maxPage,
  };
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
  assertMutationPermission(businessId, userId, "sales", "create");
  const data = customerInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const now = new Date().toISOString();
  const id = randomUUID();
  const trnValue = data.taxReference?.trim() || data.trn?.trim() || null;
  const insertCustomer = () =>
    context.db
      .insert(customers)
      .values({
        id,
        ...data,
        taxReference: trnValue,
        trn: trnValue,
        defaultCurrencyCode,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  if (!customFieldValues) {
    insertCustomer();
  } else {
    // The drizzle handle and the raw sqlite handle share one connection, so the
    // customer row and its custom field values are saved atomically.
    context.sqlite.transaction(() => {
      insertCustomer();
      saveCustomFieldValuesInTransaction(context.sqlite, "customer", id, customFieldValues);
    }).immediate();
  }

  recordActivity(businessId, {
    userId,
    action: "created",
    entityType: "customer",
    entityId: id,
    entityNumber: data.name,
    summary: `Created customer ${data.name}`,
    details: { email: data.email, phone: data.phone },
  });

  return id;
}

export function updateCustomer(
  businessId: string,
  userId: string,
  customerId: string,
  input: CustomerInput,
  customFieldValues?: Record<string, string>,
) {
  assertMutationPermission(businessId, userId, "sales", "edit");
  const data = customerInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const current = getCustomer(businessId, userId, customerId);
  if (!current) throw new Error("CUSTOMER_NOT_FOUND");
  const trnValue =
    "taxReference" in input && input.taxReference !== undefined
      ? data.trn && data.trn.trim() !== (current.trn ?? "")
        ? data.trn.trim()
        : data.taxReference.trim() || null
      : data.trn?.trim() || null;
  const updateCustomerRow = () =>
    context.db
      .update(customers)
      .set({
        ...data,
        taxReference: trnValue,
        trn: trnValue,
        defaultCurrencyCode,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customers.id, customerId))
      .run();
  if (!customFieldValues) {
    updateCustomerRow();
  } else {
    context.sqlite.transaction(() => {
      updateCustomerRow();
      saveCustomFieldValuesInTransaction(context.sqlite, "customer", customerId, customFieldValues);
    }).immediate();
  }

  recordActivity(businessId, {
    userId,
    action: "updated",
    entityType: "customer",
    entityId: customerId,
    entityNumber: data.name,
    summary: `Updated customer ${data.name}`,
    details: { email: data.email, phone: data.phone },
  });
}
