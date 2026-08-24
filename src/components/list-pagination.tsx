"use client";

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

/**
 * Server-side pagination control for list pages. Renders Prev / "Page X
 * of Y" / Next buttons as links so the URL stays the source of truth —
 * the page is shareable, refresh-safe, and survives a back-button press.
 *
 * The control is purely presentational; it does not push state when
 * clicked, it just navigates to a new URL. That keeps the URL bar
 * authoritative and avoids a second data source.
 *
 * When `info.total <= info.pageSize`, the entire result set fits on one
 * page and the control renders the count line only (no Prev/Next chrome
 * to clutter the UI on small lists). The page-size `<select>` is shown
 * whenever `total > 0` so the user can switch row density on demand —
 * switching resets the page to 1 (URL-driven, so it's shareable too).
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
  if (info.total === 0) return null;
  const showPager = info.totalPages > 1;
  const start = rangeStart(info.page, info.pageSize);
  const end = rangeEnd(info.page, info.pageSize, info.total);
  const hasPrev = info.page > 1;
  const hasNext = info.page < info.totalPages;
  const prevHref = buildPageHref(pathname, searchParams, Math.max(1, info.page - 1));
  const nextHref = buildPageHref(pathname, searchParams, Math.min(info.totalPages, info.page + 1));

  // Page-size selector: navigate (don't push client state) so the URL is
  // the source of truth. `replace` keeps the back-button history clean.
  const onPageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    const href = buildPageSizeHref(pathname, searchParams, value);
    router.replace(href);
  };

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
            onChange={onPageSizeChange}
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
      {showPager ? (
        <div className="flex items-center gap-1.5">
          <Link
            href={prevHref}
            aria-label="Previous page"
            aria-disabled={!hasPrev}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 transition-colors",
              hasPrev ? "text-foreground hover:bg-surface-muted hover:border-border-strong" : "pointer-events-none opacity-40",
            )}
          >
            <ChevronLeft className="size-3.5" /> Prev
          </Link>
          <span className="px-2 tabular-nums">
            Page <span className="font-medium text-foreground">{info.page}</span> of <span className="font-medium text-foreground">{info.totalPages}</span>
          </span>
          <Link
            href={nextHref}
            aria-label="Next page"
            aria-disabled={!hasNext}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 transition-colors",
              hasNext ? "text-foreground hover:bg-surface-muted hover:border-border-strong" : "pointer-events-none opacity-40",
            )}
          >
            Next <ChevronRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">{info.total} {info.total === 1 ? "row" : "rows"} total</span>
      )}
    </nav>
  );
}
