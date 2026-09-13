
"use client";

import { Check, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";

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
  void storageKey;
  void businessId;
  void serverSnapshot;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <Columns3 className="size-4" /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {Object.entries(columns).map(([column, visible]) => (
          <DropdownMenuItem
            key={column}
            onSelect={(event) => {
              event.preventDefault();
              toggle(column);
            }}
            className="flex items-center gap-2"
          >
            <div className="flex size-4 items-center justify-center">
              {visible && <Check className="size-4" />}
            </div>
            {labels[column] ?? column}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

