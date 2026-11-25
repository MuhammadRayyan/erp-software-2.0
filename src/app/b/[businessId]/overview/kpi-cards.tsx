"use client";

import Link from "next/link";
import { AlertTriangle, Banknote, CircleDollarSign, Landmark, ListChecks, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOverviewCardVisibility } from "./overview-customization";

const cardIcons = {
  sales: CircleDollarSign,
  receivables: ReceiptText,
  overdue: AlertTriangle,
  bank: Banknote,
  payables: Wallet,
  vat: Landmark,
  reconcile: ListChecks,
  approvals: ShieldCheck,
} as const;

export type KpiCardIcon = keyof typeof cardIcons;

export type KpiCardData = {
  id: string;
  icon: KpiCardIcon;
  label: string;
  /** Pre-formatted value — computed on the server. */
  value: string;
  note: string;
  /** Qualifier such as "as of today" or the active period label. */
  caption?: string;
  /** Native browser tooltip shown on hover; clarifies what the metric means. */
  tooltip?: string;
  /** Optional href to make the card clickable. */
  href?: string;
  /** Highlights the card when it needs attention (e.g. overdue items). */
  attention?: boolean;
};

/**
 * Overview KPI grid. Which cards show is controlled from the overview
 * "Customize" menu (see `OverviewCustomization`).
 */
export function KpiCards({ cards }: { cards: KpiCardData[] }) {
  const isVisible = useOverviewCardVisibility();
  const visibleCards = cards.filter((card) => isVisible(card.id));
  if (cards.length === 0) return null;
  return (
    <section aria-label="Business summary">
      {visibleCards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium">No summary cards visible</p>
          <p className="mt-1 text-xs text-muted-foreground">Turn cards back on from the Customize menu.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleCards.map((card) => <KpiCard key={card.id} card={card} />)}
        </div>
      )}
    </section>
  );
}

function KpiCard({ card }: { card: KpiCardData }) {
  const Icon = cardIcons[card.icon];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
        <span className={cn(
          "grid size-6 place-items-center rounded-full",
          card.attention ? "bg-warning/15 text-warning" : "bg-surface-muted text-muted-foreground",
        )}>
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <p className="money mt-3 text-xl font-semibold tracking-[-0.02em]">{card.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {card.note}
        {card.caption && <span className="text-muted-foreground/75"> · {card.caption}</span>}
      </p>
    </>
  );
  return (
    <article
      title={card.tooltip ?? `${card.label} — ${card.note}${card.caption ? ` · ${card.caption}` : ""}`}
      className={cn(
        "rounded-lg border bg-surface-raised p-4 transition-colors hover:border-border-strong",
        card.attention ? "border-warning/40" : "border-border",
        card.href && "hover:bg-surface-muted/30",
      )}
    >
      {card.href ? <Link href={card.href} className="block h-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body}
    </article>
  );
}
