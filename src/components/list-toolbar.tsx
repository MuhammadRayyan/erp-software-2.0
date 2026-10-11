"use client";

import type { ReactNode } from "react";
import { Search, X, Calendar, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
export { FilterChip } from "@/components/ui/filter-chip";
export { StatusFilterSelect, type StatusOption } from "@/components/status-filter-select";

/** Primary container for list table filters: search, selects, date range, actions. */
export function ListToolbar({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/** Standard search bar with instant clear button and consistent responsive width. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-56 sm:w-64 md:w-72 shrink-0", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        className="pl-9 pr-8"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Standard select filter dropdown with subtle active state highlighting. */
export function ToolbarSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  const isFiltered = Boolean(value);

  return (
    <SelectNative
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={cn(
        "w-auto px-3 text-xs sm:text-sm transition-all",
        isFiltered && "border-primary/50 bg-primary/5 font-medium text-primary",
        className
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectNative>
  );
}

/** Standard unified date range filter pill: replaces awkward raw separate date inputs. */
export function DateRangeFilter({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onClear,
  fromAriaLabel = "Date from",
  toAriaLabel = "Date to",
  className,
}: {
  fromDate: string;
  toDate: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear?: () => void;
  fromAriaLabel?: string;
  toAriaLabel?: string;
  className?: string;
}) {
  const hasValue = Boolean(fromDate || toDate);

  const handleClear = () => {
    onFromChange("");
    onToChange("");
    onClear?.();
  };

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-xs shadow-[0_1px_1px_rgb(15_23_42/0.03)] focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/25 transition-all",
        hasValue && "border-primary/50 bg-primary/5 font-medium",
        className
      )}
    >
      <Calendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-[11px] font-medium text-muted-foreground select-none">From:</span>
      <input
        type="date"
        value={fromDate}
        onChange={(e) => onFromChange(e.target.value)}
        aria-label={fromAriaLabel}
        className="w-28 bg-transparent text-xs text-foreground outline-none cursor-pointer [color-scheme:light_dark]"
      />
      <span className="text-muted-foreground/50 select-none text-[10px]">—</span>
      <span className="text-[11px] font-medium text-muted-foreground select-none">To:</span>
      <input
        type="date"
        value={toDate}
        onChange={(e) => onToChange(e.target.value)}
        aria-label={toAriaLabel}
        className="w-28 bg-transparent text-xs text-foreground outline-none cursor-pointer [color-scheme:light_dark]"
      />
      {hasValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear date range"
          className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/** Standard row of active filter chips with a cohesive Reset All button. */
export function ActiveFiltersRow({
  children,
  onClearAll,
  className,
}: {
  children?: ReactNode;
  onClearAll?: () => void;
  className?: string;
}) {
  if (!children) return null;

  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mr-1">
        Active filters:
      </span>
      {children}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-1.5 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
        >
          <RotateCcw className="size-3" /> Reset all
        </button>
      )}
    </div>
  );
}
