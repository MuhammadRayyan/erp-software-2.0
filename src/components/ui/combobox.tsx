"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  keywords?: string[];
  disabled?: boolean;
}

const VIRTUALIZATION_THRESHOLD = 40;
const ESTIMATED_OPTION_HEIGHT = 36;

export interface ComboboxCreateAction {
  label: string;
  onTrigger: (searchQuery: string) => void;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearLabel?: string;
  allowClear?: boolean;
  searchable?: boolean;
  createAction?: ComboboxCreateAction;
  disabled?: boolean;
  size?: "sm" | "default";
  ariaLabel?: string;
  ariaInvalid?: boolean;
  className?: string;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  dataGridRow?: number;
  dataGridColId?: string;
  onGridTabAdvance?: (row: number, colId: string, shiftKey: boolean) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

function isVisibleEnabledElement(el: HTMLElement) {
  const disabled = el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
  return !disabled && el.offsetParent !== null;
}

function findEnabledRowCells(root: ParentNode, row: number) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`[data-grid-row="${row}"][data-grid-col-id]`),
  ).filter(isVisibleEnabledElement);
}

function focusGridCell(el: HTMLElement) {
  el.focus();
  if (el instanceof HTMLInputElement) el.select();
}

function advanceFocusFromGrid(
  trigger: HTMLButtonElement | null,
  row: number,
  colId: string,
  shiftKey: boolean,
) {
  const root: ParentNode = trigger?.closest("table, [role='grid'], form") ?? document;
  const rowCells = findEnabledRowCells(root, row);
  const idx = rowCells.findIndex((el) => el.getAttribute("data-grid-col-id") === colId);
  if (idx === -1) return false;
  if (!shiftKey) {
    if (rowCells[idx + 1]) {
      focusGridCell(rowCells[idx + 1]);
      return true;
    }
    const nextRowCells = findEnabledRowCells(root, row + 1);
    if (nextRowCells[0]) {
      focusGridCell(nextRowCells[0]);
      return true;
    }
    return false;
  }
  if (rowCells[idx - 1]) {
    focusGridCell(rowCells[idx - 1]);
    return true;
  }
  if (row > 0) {
    const prevRowCells = findEnabledRowCells(root, row - 1);
    if (prevRowCells.length > 0) {
      focusGridCell(prevRowCells[prevRowCells.length - 1]);
      return true;
    }
  }
  return false;
}

function focusAdjacentOutsideTrigger(trigger: HTMLButtonElement | null, shiftKey: boolean) {
  if (!trigger) return false;
  const focusables = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    if (el.closest("[data-radix-popper-content-wrapper]")) return false;
    if (el === trigger) return true;
    if (el.tabIndex < 0) return false;
    return isVisibleEnabledElement(el);
  });
  const idx = focusables.indexOf(trigger);
  if (idx === -1) return false;
  const target = shiftKey ? focusables[idx - 1] : focusables[idx + 1];
  if (!target) return false;
  focusGridCell(target);
  return true;
}

export function filterComboboxOptions(options: ComboboxOption[], search: string): ComboboxOption[] {
  const q = search.trim().toLowerCase();
  if (!q) return options;
  const tokens = q.split(/\s+/).filter(Boolean);
  return options.filter((opt) => {
    const haystack = [opt.label, opt.description ?? "", opt.badge ?? "", ...(opt.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

export function Combobox({
  options,
  value,
  onValueChange,
  id,
  name,
  placeholder = "Select option…",
  searchPlaceholder = "Type to search…",
  emptyText = "No matching option.",
  clearLabel = "Clear selection",
  allowClear = false,
  searchable = true,
  createAction,
  disabled = false,
  size = "default",
  ariaLabel,
  ariaInvalid,
  className,
  contentClassName,
  align = "start",
  dataGridRow,
  dataGridColId,
  onGridTabAdvance,
  onKeyDown,
}: ComboboxProps) {
  "use no memo";
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const commandRef = React.useRef<HTMLDivElement>(null);
  const createButtonRef = React.useRef<HTMLButtonElement>(null);
  const suppressCloseAutoFocusRef = React.useRef(false);
  const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null);
  const listboxId = React.useId();

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  const shouldVirtualize = options.length > VIRTUALIZATION_THRESHOLD;

  const filteredOptions = React.useMemo(() => {
    if (!shouldVirtualize) return options;
    return filterComboboxOptions(options, search);
  }, [options, search, shouldVirtualize]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns imperative scroll helpers; component opts out via "use no memo"
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? filteredOptions.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => ESTIMATED_OPTION_HEIGHT,
    initialRect: { width: 320, height: 250 },
    overscan: 6,
  });

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    if (shouldVirtualize && scrollElement) {
      virtualizer.scrollToOffset(0);
    }
  }, [open, search, shouldVirtualize, scrollElement, virtualizer]);

  function handleSelect(nextValue: string) {
    onValueChange(nextValue);
    triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }

  function handleTabKey(event: React.KeyboardEvent) {
    if (event.key !== "Tab") return;
    let moved = false;
    if (dataGridRow !== undefined && dataGridColId) {
      if (onGridTabAdvance) {
        onGridTabAdvance(dataGridRow, dataGridColId, event.shiftKey);
        moved = true;
      } else {
        moved = advanceFocusFromGrid(triggerRef.current, dataGridRow, dataGridColId, event.shiftKey);
      }
    }
    if (!moved) {
      moved = focusAdjacentOutsideTrigger(triggerRef.current, event.shiftKey);
    }
    if (moved) {
      suppressCloseAutoFocusRef.current = true;
      event.preventDefault();
    }
    setOpen(false);
  }

  const renderOption = (opt: ComboboxOption) => {
    const isSelected = opt.value === value;
    const searchKeywords = [
      opt.label,
      opt.description ?? "",
      opt.badge ?? "",
      ...(opt.keywords ?? []),
    ].filter(Boolean);

    return (
      <CommandItem
        key={opt.value}
        value={`${opt.label} ${opt.value}`}
        keywords={searchKeywords}
        disabled={opt.disabled}
        data-value={opt.value}
        data-option-value={opt.value}
        onSelect={() => handleSelect(opt.value)}
        className="w-full"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Check
            className={cn(
              "size-3.5 shrink-0 text-primary transition-opacity",
              isSelected ? "opacity-100" : "opacity-0",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{opt.label}</div>
            {opt.description && (
              <div className="truncate text-[11px] text-muted-foreground">{opt.description}</div>
            )}
          </div>
        </div>
        {opt.badge && (
          <span className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {opt.badge}
          </span>
        )}
      </CommandItem>
    );
  };

  return (
    <div className="relative flex w-full min-w-0 items-center">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (disabled) return;
          if (next) suppressCloseAutoFocusRef.current = false;
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            disabled={disabled}
            data-value={value}
            data-grid-row={dataGridRow}
            data-grid-col-id={dataGridColId}
            onKeyDown={(event) => {
              if (
                !disabled &&
                !open &&
                (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                setOpen(true);
                return;
              }
              onKeyDown?.(event);
            }}
            className={cn(
              "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-[6px] border border-border-strong bg-surface-raised text-left text-foreground shadow-[0_1px_1px_rgb(15_23_42/0.03)] outline-none transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-danger aria-invalid:bg-danger/[0.03] aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger/25 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-65",
              size === "sm" ? "h-8 px-2 text-xs" : "h-9 px-2.5 text-sm",
              allowClear && value && !disabled ? "pr-11" : "",
              className,
            )}
          >
            <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-75" />
          </button>
        </PopoverTrigger>

        {allowClear && value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={clearLabel}
            title={clearLabel}
            onClick={(event) => {
              event.stopPropagation();
              onValueChange("");
              triggerRef.current?.focus();
            }}
            className="absolute right-6 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}

        <PopoverContent
          align={align}
          className={cn(
            "w-[max(var(--radix-popover-trigger-width),240px)] max-w-[min(420px,calc(100vw-2rem))]",
            contentClassName,
          )}
          onOpenAutoFocus={(event) => {
            if (!searchable) {
              event.preventDefault();
              commandRef.current?.focus({ preventScroll: true });
            }
          }}
          onEscapeKeyDown={() => {
            triggerRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            if (suppressCloseAutoFocusRef.current) {
              suppressCloseAutoFocusRef.current = false;
              event.preventDefault();
              return;
            }
            const active = document.activeElement;
            if (
              active &&
              active !== document.body &&
              active !== triggerRef.current &&
              !contentRef.current?.contains(active)
            ) {
              event.preventDefault();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              if (
                !event.shiftKey &&
                search.trim().length > 0 &&
                createButtonRef.current &&
                document.activeElement !== createButtonRef.current
              ) {
                event.preventDefault();
                createButtonRef.current.focus();
                return;
              }
              handleTabKey(event);
            }
          }}
        >
          <div ref={contentRef}>
            <Command ref={commandRef} tabIndex={searchable ? undefined : -1} shouldFilter={!shouldVirtualize} loop>
            {searchable ? (
              <CommandInput
                placeholder={searchPlaceholder}
                value={search}
                onValueChange={setSearch}
                aria-label={searchPlaceholder}
              />
            ) : null}
            <CommandList
              id={listboxId}
              role="listbox"
              onWheel={(event) => event.stopPropagation()}
              className={shouldVirtualize ? "max-h-none overflow-hidden p-0" : undefined}
            >
              {allowClear &&
                (!shouldVirtualize ||
                  !search.trim() ||
                  clearLabel.toLowerCase().includes(search.trim().toLowerCase())) && (
                <CommandGroup>
                  <CommandItem
                    value={`__clear__ ${clearLabel} none empty`}
                    keywords={[clearLabel]}
                    onSelect={() => handleSelect("")}
                    className="text-muted-foreground"
                  >
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "size-3.5 shrink-0 text-primary transition-opacity",
                          !value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span>{clearLabel}</span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {shouldVirtualize ? (
                filteredOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {emptyText}
                  </div>
                ) : (
                  <div
                    ref={setScrollElement}
                    className="max-h-[250px] overflow-y-auto p-1"
                  >
                    <div
                      style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        width: "100%",
                        position: "relative",
                      }}
                    >
                      {virtualizer.getVirtualItems().map((virtualRow) => {
                        const opt = filteredOptions[virtualRow.index];
                        return (
                          <div
                            key={opt.value}
                            data-index={virtualRow.index}
                            ref={virtualizer.measureElement}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            {renderOption(opt)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : (
                <>
                  <CommandEmpty>{emptyText}</CommandEmpty>
                  <CommandGroup>{filteredOptions.map(renderOption)}</CommandGroup>
                </>
              )}
            </CommandList>
            {createAction ? (
              <div className="border-t border-border bg-surface/60 p-1">
                <button
                  ref={createButtonRef}
                  type="button"
                  onClick={() => {
                    const query = search.trim();
                    suppressCloseAutoFocusRef.current = true;
                    setOpen(false);
                    createAction.onTrigger(query);
                  }}
                  className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {search.trim()
                      ? `${createAction.label}: "${search.trim()}"`
                      : createAction.label}
                  </span>
                </button>
              </div>
            ) : null}
          </Command>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
