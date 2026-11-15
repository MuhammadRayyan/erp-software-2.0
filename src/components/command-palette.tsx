"use client";

import * as React from "react";
import { CommandGroup, CommandItem as CmdkItem, CommandSeparator } from "@/components/ui/command";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { LucideIcon } from "lucide-react";

export type CommandItem = {
  id?: string;
  label: string;
  hint?: string;
  group?: "Create" | "Navigation" | "Settings" | "Switch Business" | string;
  icon?: LucideIcon;
  keywords?: string;
  shortcut?: string;
  onSelect: () => void;
};

const GROUP_ORDER = ["Create", "Navigation", "Settings", "Switch Business"];

function getGroupName(item: CommandItem): string {
  return item.group ?? (item.hint === "Create" ? "Create" : "Navigation");
}

function getGroupPriority(groupName: string): number {
  const idx = GROUP_ORDER.indexOf(groupName);
  return idx >= 0 ? idx : GROUP_ORDER.length;
}

export function scoreCommandItem(item: CommandItem, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 1;

  const label = item.label.toLowerCase();
  if (label === query) return 1000;
  if (label.startsWith(query)) return 800;

  const labelWords = label.split(/[\s/&_-]+/).filter(Boolean);
  if (labelWords.some((word) => word.startsWith(query))) return 650;
  if (label.includes(query)) return 500;

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => label.includes(tok))) {
    return 400;
  }

  const groupName = getGroupName(item).toLowerCase();
  const hint = (item.hint ?? "").toLowerCase();
  const extra = (item.keywords ?? "").toLowerCase();
  const haystack = `${label} ${hint} ${groupName} ${extra}`;
  if (!tokens.every((tok) => haystack.includes(tok))) {
    return 0;
  }

  const metaWords = `${hint} ${groupName} ${extra}`.split(/[\s/&_-]+/).filter(Boolean);
  if (metaWords.some((word) => word.startsWith(tokens[0]))) {
    return 250;
  }
  return 150;
}

/**
 * Global Ctrl/Cmd+K command palette backed by cmdk and @radix-ui/react-dialog.
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
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const grouped = React.useMemo(() => {
    const hasQuery = search.trim().length > 0;
    const buckets = new Map<string, Array<{ item: CommandItem; score: number; index: number }>>();

    items.forEach((item, index) => {
      const score = scoreCommandItem(item, search);
      if (score <= 0) return;
      const groupName = getGroupName(item);
      const bucket = buckets.get(groupName) ?? [];
      bucket.push({ item, score, index });
      buckets.set(groupName, bucket);
    });

    const entries: Array<{ groupName: string; items: CommandItem[]; maxScore: number }> = [];
    for (const [groupName, bucket] of buckets.entries()) {
      if (hasQuery) {
        bucket.sort((a, b) => b.score - a.score || a.index - b.index);
      }
      const maxScore = bucket.reduce((max, entry) => Math.max(max, entry.score), 0);
      entries.push({
        groupName,
        items: bucket.map((entry) => entry.item),
        maxScore,
      });
    }

    entries.sort((a, b) => {
      if (hasQuery && b.maxScore !== a.maxScore) {
        return b.maxScore - a.maxScore;
      }
      const pa = getGroupPriority(a.groupName);
      const pb = getGroupPriority(b.groupName);
      if (pa !== pb) return pa - pb;
      return a.groupName.localeCompare(b.groupName);
    });

    return entries.map(({ groupName, items: groupItems }) => [groupName, groupItems] as const);
  }, [items, search]);

  function run(item: CommandItem) {
    onOpenChange(false);
    item.onSelect();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      shouldFilter={false}
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search pages, actions, settings, or switch business…"
        aria-label="Search commands"
        className="h-11 pr-8 text-base sm:text-sm"
      />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>
          {search.trim()
            ? `No commands match “${search.trim()}”.`
            : "No commands available."}
        </CommandEmpty>
        {grouped.map(([groupName, groupItems], idx) => (
          <React.Fragment key={groupName}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={groupName}>
              {groupItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CmdkItem
                    key={item.id ?? `${groupName}-${item.label}-${item.hint ?? ""}`}
                    value={`${item.label} ${item.hint ?? ""} ${groupName}`}
                    onSelect={() => run(item)}
                    className="min-h-10 sm:min-h-8"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.shortcut ? (
                      <CommandShortcut>{item.shortcut}</CommandShortcut>
                    ) : item.hint ? (
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {item.hint}
                      </span>
                    ) : null}
                  </CmdkItem>
                );
              })}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
