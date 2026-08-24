"use client";

import { useMemo } from "react";
import { AlertTriangle, Banknote, CircleDollarSign, LayoutGrid, ReceiptText } from "lucide-react";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const cardIcons = {
  sales: CircleDollarSign,
  receivables: ReceiptText,
  overdue: AlertTriangle,
  bank: Banknote,
} as const;

export type KpiCardIcon = keyof typeof cardIcons;

export type KpiCardData = {
  id: string;
  icon: KpiCardIcon;
  label: string;
  /** Pre-formatted money string — values are fetched on the server. */
  value: string;
  note: string;
  /** Qualifier such as "as of today" or the active period label. */
  caption?: string;
  /** Native browser tooltip shown on hover; clarifies what the metric means. */
  tooltip?: string;
};

/**
 * Client wrapper around the overview KPI cards. Card visibility is toggled via
 * the "Cards" dropdown and persisted with the shared column-visibility hook
 * (localStorage key `ledgerly.cols.overview-cards`). When `serverSnapshot`
 * + `businessId` are passed, toggles also sync to the per-account
 * preferences API so card visibility follows the user across devices.
 */
export function KpiCards({ cards, businessId, serverSnapshot }: { cards: KpiCardData[]; businessId?: string; serverSnapshot?: ColumnVisibility }) {
  // Memoized so the shared visibility hook sees a stable defaults reference.
  const initialVisibility = useMemo(() => Object.fromEntries(cards.map((card) => [card.id, true])), [cards]);
  const { visibility, toggle } = useColumnVisibility("overview-cards", initialVisibility, businessId ? { businessId, serverSnapshot } : undefined);
  const visibleCards = cards.filter((card) => visibility[card.id] !== false);
  const hiddenCount = cards.length - visibleCards.length;
  return (
    <section aria-label="Business summary" className="mt-4">
      <div className="mb-3 flex items-center justify-end gap-3">
        {hiddenCount > 0 && <p className="text-xs text-muted-foreground">{hiddenCount} {hiddenCount === 1 ? "card" : "cards"} hidden</p>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary"><LayoutGrid className="size-4" /> Cards</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Show cards</DropdownMenuLabel>
            {cards.map((card) => (
              <DropdownMenuItem key={card.id} onSelect={(event) => { event.preventDefault(); toggle(card.id); }}>
                <span className="w-4">{visibility[card.id] !== false ? "✓" : ""}</span>{card.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {visibleCards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium">No cards visible</p>
          <p className="mt-1 text-xs text-muted-foreground">Turn cards back on from the Cards menu.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleCards.map((card) => {
            const Icon = cardIcons[card.icon];
            return (
              <article key={card.id} title={card.tooltip ?? `${card.label} — ${card.note}${card.caption ? ` · ${card.caption}` : ""}`} className="rounded-lg border border-border bg-surface-raised p-4 transition-colors hover:border-border-strong">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <span className="grid size-6 place-items-center rounded-full bg-surface-muted text-muted-foreground"><Icon className="size-3.5" /></span>
                </div>
                <p className="money mt-3 text-xl font-semibold tracking-[-0.02em]">{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.note}
                  {card.caption && <span className="text-muted-foreground/75"> · {card.caption}</span>}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
