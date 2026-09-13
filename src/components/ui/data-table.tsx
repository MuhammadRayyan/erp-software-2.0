
"use client";

import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { formatOptional } from "@/core/format";

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
      <div className="rounded-lg border border-border bg-surface py-10 text-center">
        <p className="font-medium">{noResultsMessage}</p>
        <p className="mt-1 text-sm text-muted-foreground">{noResultsSubtext}</p>
        {onClearFilters && (
          <button 
            type="button" 
            onClick={onClearFilters}
            className="mt-4 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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

                return (
                  <th
                    key={header.id}
                    className={classes.trim()}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    style={{ cursor: canSort ? "pointer" : "default" }}
                  >
                    <div className={`flex items-center gap-1.5 ${meta?.numeric ? "justify-end" : ""}`}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {isSorted === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : isSorted === "desc" ? (
                        <ArrowDown className="size-3" />
                      ) : canSort ? (
                        <span className="opacity-0 group-hover:opacity-30 transition-opacity"><ChevronsUpDown className="size-3" /></span>
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

                const val = cell.getValue();
                const rendered = (val === null || val === undefined || val === "") 
                  ? <span className="text-muted-foreground/50">{formatOptional(null)}</span>
                  : flexRender(cell.column.columnDef.cell, cell.getContext());

                return (
                  <td key={cell.id} className={classes.trim()}>
                    {rendered}
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

