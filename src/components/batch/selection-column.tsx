"use client";

import { Checkbox } from "@/components/ui/checkbox";

/** Leading checkbox column for TanStack tables with row selection enabled. */
export function selectionColumn<T>(rowLabel: (row: T) => string, allLabel = "Select all rows on this page") {
  return {
    id: "select",
    header: ({ table }: any) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
        aria-label={allLabel}
      />
    ),
    cell: ({ row }: any) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
        aria-label={`Select ${rowLabel(row.original as T)}`}
      />
    ),
    meta: { className: "w-9 text-center" },
    enableSorting: false,
    enableHiding: false,
  };
}
