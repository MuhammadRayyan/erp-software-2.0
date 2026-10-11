
"use client";

import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";

interface DataTableProps {
  table: any;
  minWidth?: string;
  density?: "compact" | "default" | "comfortable";
  pinFirstColumn?: boolean;
  maxHeight?: string;
  noResultsMessage?: string;
  noResultsSubtext?: string;
  onClearFilters?: () => void;
}

export function DataTable({
  table,
  minWidth = "min-w-[800px]",
  density = "default",
  pinFirstColumn = false,
  maxHeight,
  noResultsMessage = "No results found",
  noResultsSubtext = "Try adjusting your filters.",
  onClearFilters,
}: DataTableProps) {
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised py-12 px-4 text-center">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
          <Search className="size-5" />
        </div>
        <p className="font-semibold text-sm text-foreground">{noResultsMessage}</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">{noResultsSubtext}</p>
        {onClearFilters && (
          <button 
            type="button" 
            onClick={onClearFilters}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div 
      className="data-panel" 
      style={{ ...(maxHeight ? { "--table-max-height": maxHeight } as any : {}) }}
    >
      <table className={`data-table ${minWidth}`} data-density={density}>
        <thead>
          {table.getHeaderGroups().map((headerGroup: any) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header: any, index: number) => {
                const isSorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const meta = header.column.columnDef.meta as { className?: string, numeric?: boolean, wrap?: boolean } | undefined;
                
                const isSticky = pinFirstColumn && index === 0;
                let classes = meta?.className || "";
                if (meta?.numeric) classes += " col-numeric";
                if (meta?.wrap) classes += " col-wrap";
                else classes += " truncate";
                if (isSticky) classes += " sticky-col";
                classes += " select-none group/th";
                if (canSort) classes += " cursor-pointer hover:text-foreground transition-colors";

                return (
                  <th
                    key={header.id}
                    className={classes.trim()}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className={`flex items-center gap-1.5 ${meta?.numeric ? "justify-end" : ""}`}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {isSorted === "asc" ? (
                        <ArrowUp className="size-3 text-primary shrink-0" />
                      ) : isSorted === "desc" ? (
                        <ArrowDown className="size-3 text-primary shrink-0" />
                      ) : canSort ? (
                        <ChevronsUpDown className="size-3 text-muted-foreground/40 opacity-0 group-hover/th:opacity-100 transition-opacity shrink-0" />
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.id} className="group">
              {row.getVisibleCells().map((cell: any, index: number) => {
                const meta = cell.column.columnDef.meta as { className?: string, numeric?: boolean, wrap?: boolean } | undefined;
                
                const isSticky = pinFirstColumn && index === 0;
                let classes = meta?.className || "";
                if (meta?.numeric) classes += " col-numeric";
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

