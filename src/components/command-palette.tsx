"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, type LucideIcon } from "lucide-react";
import { DialogContent, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

export type CommandItem = {
  label: string;
  hint?: string;
  icon?: LucideIcon;
  keywords?: string;
  onSelect: () => void;
};

/**
 * Compact Ctrl/Cmd+K command palette built on the existing Dialog primitive.
 * Arrow keys move the highlight, Enter runs the highlighted command, Escape
 * closes (handled by the dialog). Mouse hover moves the highlight, click runs.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
}) {
  // Mounted only while open so every open starts from a clean query/highlight.
  if (!open) return null;
  return <PaletteDialog onOpenChange={onOpenChange} items={items} />;
}

function PaletteDialog({ onOpenChange, items }: { onOpenChange: (open: boolean) => void; items: CommandItem[] }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  // Derived so the highlight can never point outside the filtered list,
  // even if the list shrinks between keystrokes.
  const highlighted = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlighted, filtered]);

  function setHighlighted(index: number) {
    setActiveIndex(Math.min(Math.max(index, 0), Math.max(filtered.length - 1, 0)));
  }

  function run(item: CommandItem) {
    onOpenChange(false);
    item.onSelect();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length) setHighlighted((highlighted + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length) setHighlighted((highlighted - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[highlighted];
      if (item) run(item);
    }
  }

  return (
    <DialogRoot open onOpenChange={onOpenChange}>
      <DialogContent
        // Mobile: full-width bottom sheet pinned to the viewport bottom (with
        // safe-area inset so iOS notches/home indicators don't cover the input).
        // Desktop (sm+): centered card with max-w-lg, top-aligned so the list
        // has room to grow downward without overflowing the viewport.
        // `w-auto` overrides the default `w-[calc(100%-2rem)]` so `left-3 right-3`
        // can pin both edges simultaneously (CSS only honors left+right when
        // width is auto).
        className="top-auto bottom-3 left-3 right-3 w-auto max-w-none translate-x-0 translate-y-0 rounded-xl p-0 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-[12%] sm:max-w-lg sm:-translate-x-1/2 sm:translate-y-0"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-listbox"
            aria-activedescendant={filtered.length ? `command-palette-option-${highlighted}` : undefined}
            // Larger text + no zoom on focus (iOS Safari zooms on <16px inputs).
            className="h-full w-full bg-transparent pr-11 text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
          />
        </div>
        <div ref={listRef} id="command-palette-listbox" role="listbox" aria-label="Commands" className="max-h-[60vh] overflow-y-auto p-1.5">
          {filtered.length ? (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const active = index === highlighted;
              return (
                <div
                  key={`${item.label}-${index}`}
                  id={`command-palette-option-${index}`}
                  role="option"
                  aria-selected={active}
                  data-index={index}
                  tabIndex={-1}
                  // Larger touch target on mobile (h-11) so each row is comfortable
                  // to tap; tighter on desktop (sm:h-9) for density.
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => run(item)}
                  className={cn(
                    "flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[15px] outline-none sm:h-9 sm:text-[13px]",
                    active ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                  <span className="truncate">{item.label}</span>
                  {item.hint ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{item.hint}</span> : null}
                </div>
              );
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No commands match “{query.trim()}”.</p>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
