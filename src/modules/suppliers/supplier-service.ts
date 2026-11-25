import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { suppliers } from "@/core/db/business-schema";
import { saveCustomFieldValuesInTransaction } from "@/modules/custom-fields/custom-field-service";
import { supplierInputSchema, type SupplierInput } from "./supplier-input";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import type { ListSortDir } from "@/lib/list-query-params";
import {
  buildLikePattern,
  clampPositiveInt,
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
  resolveSortSql,
} from "@/modules/shared/list-query-helpers";
import { runBatch } from "@/modules/shared/batch";

const SUPPLIER_TOTALS_CTE = `
  purchase_totals AS (
    SELECT supplier_id, SUM(base_total_minor) AS total_purchased_minor
    FROM purchase_invoices
    WHERE document_status = 'posted'
    GROUP BY supplier_id
  ),
  payment_totals AS (
    SELECT supplier_id, SUM(released_carrying_amount_minor) AS total_paid_minor
    FROM supplier_payments
    WHERE document_status = 'posted'
    GROUP BY supplier_id
  )
`;

export interface SupplierListRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_reference: string | null;
  address: string | null;
  notes: string | null;
  is_active: number;
  payment_terms_days: number;
  paymentTermsDays: number;
  created_at: string;
  updated_at: string;
  total_purchased_minor: number;
  total_paid_minor: number;
}

export function listSuppliers(businessId: string, userId: string): SupplierListRow[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    WITH ${SUPPLIER_TOTALS_CTE}
    SELECT s.*, s.payment_terms_days AS paymentTermsDays,
      COALESCE(pt.total_purchased_minor, 0) AS total_purchased_minor,
      COALESCE(pay.total_paid_minor, 0) AS total_paid_minor
    FROM suppliers s
    LEFT JOIN purchase_totals pt ON pt.supplier_id = s.id
    LEFT JOIN payment_totals pay ON pay.supplier_id = s.id
    ORDER BY s.name ASC
  `).all() as SupplierListRow[];
}

export type SupplierListSummary = {
  unfilteredTotal: number;
  filteredTotal: number;
  activeCount: number;
  totalOutstandingMinor: number;
};

/** Result of `listSuppliersPaginated`. The `rows` slice is just the rows for the
 *  requested page; `total` is the filtered supplier count; `summary` holds DB-wide totals. */
export type PaginatedSuppliers = {
  rows: ReturnType<typeof listSuppliers>;
  total: number;
  summary: SupplierListSummary;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

/**
 * Paginated supplier list with SQL filtering, sorting, and DB-wide outstanding balance totals.
 */
export function listSuppliersPaginated(
  businessId: string,
  userId: string,
  filters: { q?: string; status?: string; sort?: string; dir?: ListSortDir; page?: number; pageSize?: number } = {},
): PaginatedSuppliers {
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);
  const { sqlite } = getBusinessDb(businessId, userId);

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (filters.status === "active") {
    conditions.push("s.is_active = 1");
  } else if (filters.status === "inactive") {
    conditions.push("s.is_active = 0");
  }

  const likePattern = buildLikePattern(filters.q);
  if (likePattern) {
    conditions.push(
      "(lower(s.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(s.email, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(s.phone, '')) LIKE ? ESCAPE '\\')",
    );
    values.push(likePattern, likePattern, likePattern);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const unfilteredRow = sqlite.prepare(`SELECT COUNT(*) AS total FROM suppliers`).get() as { total: number };
  const summaryRow = sqlite
    .prepare(`
      WITH ${SUPPLIER_TOTALS_CTE}
      SELECT
        COUNT(*) AS filtered_total,
        COALESCE(SUM(CASE WHEN s.is_active = 1 THEN 1 ELSE 0 END), 0) AS active_count,
        COALESCE(SUM(MAX(0, COALESCE(pt.total_purchased_minor, 0) - COALESCE(pay.total_paid_minor, 0))), 0) AS total_outstanding_minor
      FROM suppliers s
      LEFT JOIN purchase_totals pt ON pt.supplier_id = s.id
      LEFT JOIN payment_totals pay ON pay.supplier_id = s.id
      ${where}
    `)
    .get(...values) as {
    filtered_total: number;
    active_count: number;
    total_outstanding_minor: number;
  };

  const total = summaryRow.filtered_total;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;

  const sortColumns: Record<string, string> = {
    name: "s.name",
    email: "lower(COALESCE(s.email, ''))",
    outstanding: "MAX(0, COALESCE(pt.total_purchased_minor, 0) - COALESCE(pay.total_paid_minor, 0))",
    status: "s.is_active",
  };
  const orderByClause = resolveSortSql(
    filters.sort,
    filters.dir,
    sortColumns,
    "s.name ASC, s.id ASC",
  );

  const rows = sqlite.prepare(`
    WITH ${SUPPLIER_TOTALS_CTE}
    SELECT s.*, s.payment_terms_days AS paymentTermsDays,
      COALESCE(pt.total_purchased_minor, 0) AS total_purchased_minor,
      COALESCE(pay.total_paid_minor, 0) AS total_paid_minor
    FROM suppliers s
    LEFT JOIN purchase_totals pt ON pt.supplier_id = s.id
    LEFT JOIN payment_totals pay ON pay.supplier_id = s.id
    ${where}
    ORDER BY ${orderByClause}
    LIMIT ? OFFSET ?
  `).all(...values, pageSize, offset) as SupplierListRow[];

  return {
    rows,
    total,
    summary: {
      unfilteredTotal: unfilteredRow.total,
      filteredTotal: total,
      activeCount: summaryRow.active_count,
      totalOutstandingMinor: summaryRow.total_outstanding_minor,
    },
    page: effectivePage,
    pageSize,
    totalPages: maxPage,
  };
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
  assertMutationPermission(businessId, userId, "purchases", "create");
  const data = supplierInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const id = randomUUID();
  const now = new Date().toISOString();
  const trnValue = data.taxReference?.trim() || data.trn?.trim() || null;
  const addressValue = data.address?.trim() || data.registeredAddress?.trim() || null;
  const insertSupplier = () =>
    context.db.insert(suppliers).values({
      id,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      taxReference: trnValue,
      address: addressValue,
      legalName: data.legalName || null,
      trn: trnValue,
      legalRegistrationIdentifier: data.legalRegistrationIdentifier || null,
      electronicAddress: data.electronicAddress || null,
      electronicAddressScheme: data.electronicAddressScheme || null,
      registeredAddress: addressValue,
      countryCode: data.countryCode || null,
      defaultCurrencyCode,
      paymentTermsDays: data.paymentTermsDays ?? 0,
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

  recordActivity(businessId, {
    userId,
    action: "created",
    entityType: "supplier",
    entityId: id,
    entityNumber: data.name,
    summary: `Created supplier ${data.name}`,
    details: { email: data.email, phone: data.phone },
  });

  return id;
}

export function updateSupplier(
  businessId: string,
  userId: string,
  supplierId: string,
  input: SupplierInput,
  customFieldValues?: Record<string, string>,
) {
  assertMutationPermission(businessId, userId, "purchases", "edit");
  const data = supplierInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const current = context.db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!current) throw new Error("Supplier not found.");
  const trnValue =
    "taxReference" in input && input.taxReference !== undefined
      ? data.trn && data.trn.trim() !== (current.trn ?? "")
        ? data.trn.trim()
        : data.taxReference.trim() || null
      : data.trn?.trim() || null;
  const addressValue =
    "address" in input && input.address !== undefined
      ? data.registeredAddress && data.registeredAddress.trim() !== (current.registeredAddress ?? "")
        ? data.registeredAddress.trim()
        : data.address.trim() || null
      : data.registeredAddress?.trim() || null;
  const updateSupplierRow = () =>
    context.db.update(suppliers).set({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      taxReference: trnValue,
      address: addressValue,
      legalName: data.legalName || null,
      trn: trnValue,
      legalRegistrationIdentifier: data.legalRegistrationIdentifier || null,
      electronicAddress: data.electronicAddress || null,
      electronicAddressScheme: data.electronicAddressScheme || null,
      registeredAddress: addressValue,
      countryCode: data.countryCode || null,
      defaultCurrencyCode,
      paymentTermsDays: data.paymentTermsDays !== undefined ? data.paymentTermsDays : current.paymentTermsDays,
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

  recordActivity(businessId, {
    userId,
    action: "updated",
    entityType: "supplier",
    entityId: supplierId,
    entityNumber: data.name,
    summary: `Updated supplier ${data.name}`,
    details: { email: data.email, phone: data.phone },
  });
}

export const listActiveSuppliers = cache((businessId: string, userId: string) => {
  return getBusinessDb(businessId, userId).db.select().from(suppliers)
    .where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)).all();
});

/** Activates or deactivates several suppliers at once (inactive suppliers are hidden from pickers). */
export function setSuppliersActive(businessId: string, userId: string, ids: readonly string[], active: boolean) {
  assertMutationPermission(businessId, userId, "purchases", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const update = sqlite.prepare("UPDATE suppliers SET is_active = ?, updated_at = ? WHERE id = ?");
  const name = sqlite.prepare("SELECT name FROM suppliers WHERE id = ?");
  const now = new Date().toISOString();
  return runBatch(ids, (id) => {
    if (update.run(active ? 1 : 0, now, id).changes !== 1) throw new Error("Supplier not found.");
  }, (id) => (name.get(id) as { name: string } | undefined)?.name);
}
