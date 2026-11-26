"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Outer bordered card wrapping `<DataTable framed={false} />`, `<TableTotalsBar />`, and `<ListPagination />`. */
export function ListTableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[8px] border border-border bg-surface-raised", className)}>
      {children}
    </div>
  );
}

const INTERACTIVE_CLICK_SELECTOR =
  'a, button, input, select, textarea, label, [role="checkbox"], [role="menuitem"], [role="button"], [data-no-row-click]';

interface DataTableProps {
  table: any;
  minWidth?: string;
  density?: "compact" | "default" | "comfortable";
  pinFirstColumn?: boolean;
  maxHeight?: string;
  framed?: boolean;
  noResultsMessage?: string;
  noResultsSubtext?: string;
  onClearFilters?: () => void;
  getRowHref?: (original: any) => string | undefined;
  onRowClick?: (original: any) => void;
}

export function DataTable({
  table,
  minWidth = "min-w-table-lg",
  density,
  pinFirstColumn = false,
  maxHeight,
  framed = true,
  noResultsMessage = "No results found",
  noResultsSubtext = "Try adjusting your filters.",
  onClearFilters,
  getRowHref,
  onRowClick,
}: DataTableProps) {
  const router = useRouter();
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <div
        className={
          framed
            ? "rounded-lg border border-border bg-surface-raised py-12 px-4 text-center"
            : "bg-surface-raised py-12 px-4 text-center"
        }
      >
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
          <Search className="size-5" />
        </div>
        <p className="font-semibold text-sm text-foreground">{noResultsMessage}</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">{noResultsSubtext}</p>
        {onClearFilters && (
          <Button
            type="button"
            size="sm"
            onClick={onClearFilters}
            className="mt-4"
          >
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  function handleRowActivate(event: MouseEvent<HTMLTableRowElement>, original: any) {
    if (!getRowHref && !onRowClick) return;
    if (event.defaultPrevented || event.button !== 0 || event.altKey) return;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    const selectedText = window.getSelection()?.toString();
    if (selectedText && selectedText.length > 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest(INTERACTIVE_CLICK_SELECTOR)
    ) {
      return;
    }

    if (getRowHref) {
      const href = getRowHref(original);
      if (!href) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(href);
      return;
    }

    onRowClick?.(original);
  }

  function handleRowAuxClick(event: MouseEvent<HTMLTableRowElement>, original: any) {
    if (!getRowHref || event.button !== 1 || event.defaultPrevented) return;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_CLICK_SELECTOR)) return;
    const href = getRowHref(original);
    if (!href) return;
    event.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className={framed ? "data-panel" : "overflow-x-auto overflow-y-auto"}
      style={{ ...(maxHeight ? (framed ? { "--table-max-height": maxHeight } : { maxHeight }) as any : {}) }}
    >
      <table className={`data-table ${minWidth}`} data-density={density}>
        <thead>
          {table.getHeaderGroups().map((headerGroup: any) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header: any, index: number) => {
                const isSorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const meta = header.column.columnDef.meta as
                  | { className?: string; numeric?: boolean; wrap?: boolean }
                  | undefined;

                const isSticky = pinFirstColumn && index === 0;
                let classes = meta?.className || "";
                if (meta?.numeric) classes += " col-numeric whitespace-nowrap min-w-30";
                if (meta?.wrap) classes += " col-wrap";
                else classes += " truncate";
                if (isSticky) classes += " sticky-col";
                classes += " select-none group/th";

                const ariaSort = canSort
                  ? isSorted === "asc"
                    ? "ascending"
                    : isSorted === "desc"
                      ? "descending"
                      : "none"
                  : undefined;

                const headerContent = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());

                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className={classes.trim()}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex w-full items-center gap-1.5 rounded-sm py-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          meta?.numeric && "justify-end",
                        )}
                      >
                        {headerContent}
                        {isSorted === "asc" ? (
                          <ArrowUp className="size-3 text-primary shrink-0" aria-hidden="true" />
                        ) : isSorted === "desc" ? (
                          <ArrowDown className="size-3 text-primary shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown
                            className="size-3 text-muted-foreground/40 opacity-0 group-hover/th:opacity-100 group-focus-within/th:opacity-100 transition-opacity shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      <div className={cn("flex items-center gap-1.5", meta?.numeric && "justify-end")}>
                        {headerContent}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row: any) => {
            const rowHref = getRowHref ? getRowHref(row.original) : undefined;
            const isClickable = Boolean(rowHref || onRowClick);
            return (
              <tr
                key={row.id}
                onClick={isClickable ? (event) => handleRowActivate(event, row.original) : undefined}
                onAuxClick={rowHref ? (event) => handleRowAuxClick(event, row.original) : undefined}
                className={cn("group", isClickable && "cursor-pointer")}
              >
                {row.getVisibleCells().map((cell: any, index: number) => {
                  const meta = cell.column.columnDef.meta as
                    | { className?: string; numeric?: boolean; wrap?: boolean }
                    | undefined;

                  const isSticky = pinFirstColumn && index === 0;
                  let classes = meta?.className || "";
                  if (meta?.numeric) classes += " col-numeric whitespace-nowrap min-w-30";
                  if (meta?.wrap) classes += " col-wrap";
                  else classes += " truncate";
                  if (isSticky) classes += " sticky-col";

                  return (
                    <td key={cell.id} className={classes.trim()}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
