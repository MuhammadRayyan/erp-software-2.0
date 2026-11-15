import type { SortingState, Updater } from "@tanstack/react-table";
import { createLoader, parseAsInteger, parseAsString, parseAsStringEnum } from "nuqs/server";

export const LIST_SORT_DIRS = ["asc", "desc"] as const;
export type ListSortDir = (typeof LIST_SORT_DIRS)[number];

/**
 * Shared typed URL query-state parsers for paginated list tables.
 * Uses `nuqs/server` so both Next.js Server Components and `"use client"`
 * table components consume the exact same key names and default values.
 */
export const invoiceListParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
  customerId: parseAsString.withDefault(""),
  projectId: parseAsString.withDefault(""),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
  sort: parseAsString.withDefault(""),
  dir: parseAsStringEnum<ListSortDir>([...LIST_SORT_DIRS]).withDefault("desc"),
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(50),
};

export const purchaseInvoiceListParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
  supplierId: parseAsString.withDefault(""),
  projectId: parseAsString.withDefault(""),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
  sort: parseAsString.withDefault(""),
  dir: parseAsStringEnum<ListSortDir>([...LIST_SORT_DIRS]).withDefault("desc"),
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(50),
};

export const directoryListParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
  sort: parseAsString.withDefault(""),
  dir: parseAsStringEnum<ListSortDir>([...LIST_SORT_DIRS]).withDefault("asc"),
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(50),
};

export const cashDocumentListParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
  sort: parseAsString.withDefault(""),
  dir: parseAsStringEnum<ListSortDir>([...LIST_SORT_DIRS]).withDefault("desc"),
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(50),
};

export const loadInvoiceListParams = createLoader(invoiceListParsers);
export const loadPurchaseInvoiceListParams = createLoader(purchaseInvoiceListParsers);
export const loadDirectoryListParams = createLoader(directoryListParsers);
export const loadCashDocumentListParams = createLoader(cashDocumentListParsers);

const ALLOWED_PAGE_SIZES = new Set([25, 50, 100, 200]);

export function sanitizePageSize(value: number, fallback = 50): number {
  return ALLOWED_PAGE_SIZES.has(value) ? value : fallback;
}

export function sanitizePage(value: number): number {
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/**
 * Normalize legacy short invoice status tokens (`overdue`, `draft`, `paid`, `void`, etc.)
 * into canonical prefixed tokens so deep links populate UI filters and chips seamlessly.
 * Note `"unpaid"` (linked from Overview Outstanding Receivables card) stays distinct from
 * `"payment:unpaid"` so `"unpaid"` filters all open balances (`balance > 0`) while
 * `"payment:unpaid"` filters rows whose badge is strictly `Unpaid`.
 */
export function normalizeInvoiceStatusToken(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value || value === "all") return "";
  switch (value) {
    case "draft":
    case "pending_approval":
    case "posted":
    case "void":
      return `document:${value}`;
    case "unpaid":
    case "open":
      return "payment:open";
    case "partially_paid":
    case "paid":
    case "overdue":
      return `payment:${value}`;
    case "document:draft":
    case "document:pending_approval":
    case "document:posted":
    case "document:void":
    case "payment:open":
    case "payment:unpaid":
    case "payment:partially_paid":
    case "payment:paid":
    case "payment:overdue":
      return value;
    default:
      return "";
  }
}

export function toSortingState(sort: string, dir: ListSortDir): SortingState {
  if (!sort) return [];
  return [{ id: sort, desc: dir === "desc" }];
}

export function resolveNextSortFromUpdater(
  updater: Updater<SortingState>,
  currentSort: string,
  currentDir: ListSortDir,
  defaultDir: ListSortDir,
): { sort: string; dir: ListSortDir } {
  const current = toSortingState(currentSort, currentDir);
  const next = typeof updater === "function" ? updater(current) : updater;
  const first = next[0];
  if (!first) {
    return { sort: "", dir: defaultDir };
  }
  return {
    sort: first.id,
    dir: first.desc ? "desc" : "asc",
  };
}

/**
 * Serialize active list query params cleanly for `ListPagination` and `ListDateFilter`
 * so page switches and date-range selections preserve search/filter/sort state.
 */
export function buildPreservedSearchParams(
  raw: Record<string, string | number | undefined | null>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "status" && value === "all") continue;
    if (key === "page" && Number(value) <= 1) continue;
    if (key === "pageSize" && Number(value) === 50) continue;
    params.set(key, String(value));
  }
  return params;
}
