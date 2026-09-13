"use client";

import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";

interface DataTableProps {
  table: any;
  minWidth?: string;
  noResultsMessage?: string;
  noResultsSubtext?: string;
  onClearFilters?: () => void;
}

export function DataTable({
  table,
  minWidth = "min-w-[800px]",
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
    <div className="data-panel overflow-x-auto">
      <table className={`data-table ${minWidth}`}>
        <thead>
          {table.getHeaderGroups().map((headerGroup: any) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header: any) => {
                const isSorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const meta = header.column.columnDef.meta as { className?: string } | undefined;

                return (
                  <th
                    key={header.id}
                    className={meta?.className}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    style={{ cursor: canSort ? "pointer" : "default" }}
                  >
                    <div className={`flex items-center gap-1 ${meta?.className?.includes("text-right") ? "justify-end" : ""}`}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {isSorted === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : isSorted === "desc" ? (
                        <ArrowDown className="size-3" />
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
            <tr key={row.id}>
              {row.getVisibleCells().map((cell: any) => {
                const meta = cell.column.columnDef.meta as { className?: string } | undefined;
                return (
                  <td key={cell.id} className={meta?.className}>
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
