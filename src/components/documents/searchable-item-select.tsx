"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
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
}: SearchableItemSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedItem = useMemo(
    () => items.find((item) => item.id === value),
    [items, value]
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(q);
      const skuMatch = item.sku?.toLowerCase().includes(q);
      return nameMatch || skuMatch;
    });
  }, [items, query]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
        setFocusedIndex(-1);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  function handleSelect(itemId: string) {
    onChange(itemId);
    setIsOpen(false);
    setQuery("");
    setFocusedIndex(-1);
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
    } else if (onKeyDown) {
      onKeyDown(e);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setQuery("");
      setFocusedIndex(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const total = filteredItems.length + 1; // +1 for "none" option
        return (prev + 1) % total;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const total = filteredItems.length + 1;
        return (prev - 1 + total) % total;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex === 0) {
        handleSelect("");
      } else if (focusedIndex > 0 && filteredItems[focusedIndex - 1]) {
        handleSelect(filteredItems[focusedIndex - 1].id);
      } else if (filteredItems.length === 1) {
        handleSelect(filteredItems[0].id);
      }
    } else if (e.key === "Tab") {
      setIsOpen(false);
      setQuery("");
      setFocusedIndex(-1);
      if (onKeyDown) onKeyDown(e);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-xs text-foreground outline-none transition-colors",
          "hover:border-border-strong hover:bg-surface-muted/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25",
          disabled && "cursor-not-allowed opacity-60",
          !selectedItem && "text-muted-foreground italic"
        )}
      >
        <span className="truncate pr-1 text-left">
          {selectedItem ? (
            <span className="font-medium not-italic text-foreground">
              {selectedItem.sku ? (
                <span className="font-mono text-muted-foreground mr-1.5">{selectedItem.sku} ·</span>
              ) : null}
              {selectedItem.name}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground opacity-70" />
      </button>

      {isOpen && (
        <div
          className="absolute top-[calc(100%+4px)] left-0 z-50 w-72 max-w-[85vw] rounded-lg border border-border bg-surface-raised shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
          role="dialog"
          aria-label="Filter items"
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusedIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search SKU or item name..."
              className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-56 overflow-y-auto p-1 text-xs divide-y divide-border/20"
          >
            {/* Free text / None option */}
            <li
              role="option"
              aria-selected={!selectedItem}
              onClick={() => handleSelect("")}
              onMouseEnter={() => setFocusedIndex(0)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors",
                focusedIndex === 0
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-surface-muted text-muted-foreground italic"
              )}
            >
              <span>Service / free text</span>
              {!selectedItem && <Check className="size-3.5 text-primary" />}
            </li>

            {/* Filtered items */}
            {filteredItems.map((item, idx) => {
              const itemIndex = idx + 1;
              const isSelected = selectedItem?.id === item.id;
              const isFocused = focusedIndex === itemIndex;

              return (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item.id)}
                  onMouseEnter={() => setFocusedIndex(itemIndex)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors",
                    isFocused
                      ? "bg-primary/10 text-primary font-medium"
                      : isSelected
                      ? "bg-surface-muted text-foreground font-medium"
                      : "hover:bg-surface-muted text-foreground"
                  )}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 truncate">
                      {item.sku && (
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground font-semibold">
                          {item.sku}
                        </span>
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>
                  </div>
                  {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
                </li>
              );
            })}

            {filteredItems.length === 0 && (
              <li className="px-3 py-4 text-center text-muted-foreground text-[11px]">
                No items match &quot;{query}&quot;
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
