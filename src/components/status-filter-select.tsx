"use client";

import { cn } from "@/lib/cn";
import { SelectNative } from "@/components/ui/select-native";

/**
 * A status filter option. Use a flat string for a simple list, or an
 * `{ label, options }` group for an optgroup (e.g. Document vs Payment).
 */
export type StatusOption =
  | { value: string; label: string }
  | { label: string; options: { value: string; label: string }[] };

/**
 * Shared status filter `<select>` for list tables. Renders a native
 * `<select>` with optional optgroups, styled consistently with
 * `ToolbarSelect`. Replaces the 3 inconsistent patterns that existed
 * (ToolbarSelect flat list, DropdownMenu grouped, raw <select> grouped).
 */
export function StatusFilterSelect({
  value,
  onChange,
  options,
  ariaLabel = "Filter by status",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: StatusOption[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <SelectNative
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={cn("w-auto px-3", className)}
    >
      {options.map((option, index) => {
        if ("options" in option) {
          return (
            <optgroup key={`${option.label}-${index}`} label={option.label}>
              {option.options.map((child) => (
                <option key={child.value} value={child.value}>
                  {child.label}
                </option>
              ))}
            </optgroup>
          );
        }
        return (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        );
      })}
    </SelectNative>
  );
}
