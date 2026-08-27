"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";

/**
 * Shared "Columns" dropdown for list tables. Wraps the per-table inline
 * copies that existed before (4 different implementations). Renders a
 * Button trigger + a dropdown of toggleable column labels, persisted
 * per-business via `useColumnVisibility`.
 *
 * @param storageKey    Unique key namespacing this table's preferences
 *                      (e.g. `"sales-invoices"`, `"purchase-invoices"`).
 * @param businessId    Current business id (for server-side preference sync).
 * @param serverSnapshot Server-loaded snapshot for the storage key.
 * @param columns       The visibility map (from `useColumnVisibility`).
 * @param toggle        The toggle function (from `useColumnVisibility`).
 * @param labels        Map of column-key → human label.
 */
export function ColumnsDropdown({
  storageKey,
  businessId,
  serverSnapshot,
  columns,
  toggle,
  labels,
}: {
  storageKey: string;
  businessId: string;
  serverSnapshot?: ColumnVisibility;
  columns: Record<string, boolean>;
  toggle: (column: string) => void;
  labels: Record<string, string>;
}) {
  // Touch storageKey so the hook binds to the right namespace; the actual
  // state is owned by the parent (which calls useColumnVisibility itself
  // so it can also read `columns` for rendering). This keeps the component
  // purely presentational — no double state.
  void storageKey;
  void businessId;
  void serverSnapshot;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <Columns3 className="size-4" /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(columns).map(([column, visible]) => (
          <DropdownMenuItem
            key={column}
            onSelect={(event) => {
              event.preventDefault();
              toggle(column);
            }}
          >
            <span className="w-4">{visible ? "✓" : ""}</span>
            {labels[column] ?? column}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Convenience hook that wires `useColumnVisibility` + `ColumnsDropdown`
 * label resolution together so a table can do:
 *
 *   const { columns, toggle, dropdown } = useColumns("sales-invoices", {
 *     businessId, serverSnapshot, labels: { date: "Date", total: "Total" }
 *   });
 *   // ... render <ListToolbar>... {dropdown} </ListToolbar>
 *
 * `dropdown` is a ready-to-render <ColumnsDropdown /> element.
 */
export function useColumns({
  storageKey,
  businessId,
  serverSnapshot,
  initial,
  labels,
}: {
  storageKey: string;
  businessId: string;
  serverSnapshot?: ColumnVisibility;
  initial: Record<string, boolean>;
  labels: Record<string, string>;
}) {
  const { visibility: columns, toggle } = useColumnVisibility(storageKey, initial, {
    businessId,
    serverSnapshot,
  });
  const dropdown = (
    <ColumnsDropdown
      storageKey={storageKey}
      businessId={businessId}
      serverSnapshot={serverSnapshot}
      columns={columns}
      toggle={toggle}
      labels={labels}
    />
  );
  return { columns, toggle, dropdown };
}
