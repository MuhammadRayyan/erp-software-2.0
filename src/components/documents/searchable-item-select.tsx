"use client";

import { useMemo } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import type { DocumentLineItemOption } from "./document-line-table";

export interface SearchableItemSelectProps {
  items: DocumentLineItemOption[];
  value?: string;
  onChange: (itemId: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  dataGridRow?: number;
  dataGridColId?: string;
}

export function SearchableItemSelect({
  items,
  value,
  onChange,
  onKeyDown,
  placeholder = "Service / free text",
  ariaLabel = "Select item",
  disabled = false,
  className,
  dataGridRow,
  dataGridColId,
}: SearchableItemSelectProps) {
  const options = useMemo<ComboboxOption[]>(
    () =>
      items.map((item) => ({
        value: item.id,
        label: item.sku ? `${item.sku} · ${item.name}` : item.name,
        keywords: [item.sku ?? "", item.name].filter(Boolean),
      })),
    [items],
  );

  return (
    <Combobox
      options={options}
      value={value ?? ""}
      onValueChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search SKU or item name..."
      emptyText="No matching items found."
      clearLabel={placeholder}
      allowClear
      disabled={disabled}
      size="sm"
      ariaLabel={ariaLabel}
      className={className}
      contentClassName="w-[300px]"
      dataGridRow={dataGridRow}
      dataGridColId={dataGridColId}
      onKeyDown={onKeyDown ? (event) => onKeyDown(event) : undefined}
    />
  );
}
