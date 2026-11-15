"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type PaginationInfo = {
  /** 1-indexed page number currently shown. */
  page: number;
  /** Rows per page currently used. */
  pageSize: number;
  /** Total row count across all pages for the active filters. */
  total: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

export function toPaginationInfo(data: { page: number; pageSize: number; total: number; totalPages: number }): PaginationInfo {
  return {
    page: data.page,
    pageSize: data.pageSize,
    total: data.total,
    totalPages: data.totalPages,
  };
}

/** Page-size options offered in the selector. `0` means "all rows". */
export const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

function buildPageHref(pathname: string, searchParams: URLSearchParams, page: number): string {
  const next = new URLSearchParams(searchParams);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildPageSizeHref(pathname: string, searchParams: URLSearchParams, pageSize: number): string {
  const next = new URLSearchParams(searchParams);
  // Changing page size resets the page to 1 (delete the `page` key so the
  // URL stays clean — page 1 is the implicit default).
  next.delete("page");
  // Only set `pageSize` when it's not the default (50). Keeping the URL
  // minimal means a clean `?page=2` link still works after a density switch.
  if (pageSize === 50) next.delete("pageSize");
  else next.set("pageSize", String(pageSize));
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function rangeStart(page: number, pageSize: number): number {
  return (page - 1) * pageSize + 1;
}

function rangeEnd(page: number, pageSize: number, total: number): number {
  return Math.min(page * pageSize, total);
}

type PagerTarget =
  | { kind: "link"; prevHref: string; nextHref: string }
  | { kind: "button"; onPrev: () => void; onNext: () => void };

/**
 * Pure presentational pagination bar shared between server-driven
 * (`ListPagination`) and client-driven (`ClientListPagination`) tables.
 */
export function PaginationBar({
  info,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  target,
  className,
}: {
  info: PaginationInfo;
  pageSizeOptions?: readonly number[];
  onPageSizeChange: (pageSize: number) => void;
  target: PagerTarget;
  className?: string;
}) {
  if (info.total === 0) return null;
  const start = rangeStart(info.page, info.pageSize);
  const end = rangeEnd(info.page, info.pageSize, info.total);
  const hasPrev = info.page > 1;
  const hasNext = info.page < info.totalPages;

  const prevClasses = cn(
    "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 transition-colors",
    hasPrev ? "text-foreground hover:bg-surface-muted hover:border-border-strong" : "pointer-events-none opacity-40",
  );
  const nextClasses = cn(
    "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 transition-colors",
    hasNext ? "text-foreground hover:bg-surface-muted hover:border-border-strong" : "pointer-events-none opacity-40",
  );

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-2.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <p className="tabular-nums">
          Showing <span className="font-medium text-foreground">{start}</span>–<span className="font-medium text-foreground">{end}</span> of <span className="font-medium text-foreground">{info.total}</span>
        </p>
        {/* Page-size selector — `aria-label` exposes the control to AT. */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">Rows per page</span>
          <select
            value={info.pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Rows per page"
            className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        {target.kind === "link" ? (
          <Link
            href={target.prevHref}
            aria-label="Previous page"
            aria-disabled={!hasPrev}
            tabIndex={!hasPrev ? -1 : undefined}
            className={prevClasses}
          >
            <ChevronLeft className="size-3.5" /> Prev
          </Link>
        ) : (
          <button type="button" onClick={target.onPrev} disabled={!hasPrev} aria-label="Previous page" className={prevClasses}>
            <ChevronLeft className="size-3.5" /> Prev
          </button>
        )}
        <span className="px-2 tabular-nums">
          Page <span className="font-medium text-foreground">{info.page}</span> of <span className="font-medium text-foreground">{info.totalPages}</span>
        </span>
        {target.kind === "link" ? (
          <Link
            href={target.nextHref}
            aria-label="Next page"
            aria-disabled={!hasNext}
            tabIndex={!hasNext ? -1 : undefined}
            className={nextClasses}
          >
            Next <ChevronRight className="size-3.5" />
          </Link>
        ) : (
          <button type="button" onClick={target.onNext} disabled={!hasNext} aria-label="Next page" className={nextClasses}>
            Next <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
    </nav>
  );
}

/**
 * Server-side pagination control for list pages. Renders Prev / "Page X
 * of Y" / Next buttons as links so the URL stays the source of truth —
 * the page is shareable, refresh-safe, and survives a back-button press.
 */
export function ListPagination({
  pathname,
  searchParams,
  info,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  info: PaginationInfo;
  /** Page-size options offered in the selector. Defaults to 25/50/100/200. */
  pageSizeOptions?: readonly number[];
  className?: string;
}) {
  const router = useRouter();
  const prevHref = buildPageHref(pathname, searchParams, Math.max(1, info.page - 1));
  const nextHref = buildPageHref(pathname, searchParams, Math.min(info.totalPages, info.page + 1));

  return (
    <PaginationBar
      info={info}
      pageSizeOptions={pageSizeOptions}
      onPageSizeChange={(value) => router.replace(buildPageSizeHref(pathname, searchParams, value))}
      target={{ kind: "link", prevHref, nextHref }}
      className={className}
    />
  );
}

/** Client-state pagination control matching `ListPagination` visually and structurally. */
export function ClientListPagination({
  info,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: {
  info: PaginationInfo;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
}) {
  return (
    <PaginationBar
      info={info}
      pageSizeOptions={pageSizeOptions}
      onPageSizeChange={onPageSizeChange}
      target={{
        kind: "button",
        onPrev: () => onPageChange(Math.max(1, info.page - 1)),
        onNext: () => onPageChange(Math.min(info.totalPages, info.page + 1)),
      }}
      className={className}
    />
  );
}

/** Client-side pagination hook for filtered/sorted rows that mirrors server `PaginationInfo`. */
export function useClientPagination<T>(rows: readonly T[], initialPageSize = 50) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return rows.slice(startIndex, startIndex + pageSize);
  }, [rows, safePage, pageSize]);

  const setPageSize = useCallback((nextSize: number) => {
    setPageSizeState(nextSize);
    setPage(1);
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const paginationInfo: PaginationInfo = useMemo(
    () => ({
      page: safePage,
      pageSize,
      total,
      totalPages,
    }),
    [safePage, pageSize, total, totalPages],
  );

  return {
    paginatedRows,
    page: safePage,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
    paginationInfo,
  };
}

/**
 * TanStack-compatible pagination state hook so client-sorted tables sort all
 * filtered rows first (`getSortedRowModel`) before slicing (`getPaginationRowModel`).
 */
export function useTablePagination(totalRows: number, initialPageSize = 50) {
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  const totalPages = Math.max(1, Math.ceil(totalRows / paginationState.pageSize));
  const safePageIndex = Math.min(paginationState.pageIndex, totalPages - 1);

  const pagination = useMemo(
    () => ({ pageIndex: safePageIndex, pageSize: paginationState.pageSize }),
    [safePageIndex, paginationState.pageSize],
  );

  const paginationInfo: PaginationInfo = useMemo(
    () => ({
      page: safePageIndex + 1,
      pageSize: paginationState.pageSize,
      total: totalRows,
      totalPages,
    }),
    [safePageIndex, paginationState.pageSize, totalRows, totalPages],
  );

  const setPage = useCallback((nextPage: number) => {
    setPaginationState((prev) => ({ ...prev, pageIndex: Math.max(0, nextPage - 1) }));
  }, []);

  const setPageSize = useCallback((nextSize: number) => {
    setPaginationState({ pageIndex: 0, pageSize: nextSize });
  }, []);

  return {
    pagination,
    onPaginationChange: setPaginationState,
    paginationInfo,
    setPage,
    setPageSize,
  };
}
