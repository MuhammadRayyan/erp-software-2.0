"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OverviewOption = { id: string; label: string };

type OverviewVisibility = {
  isCardVisible: (id: string) => boolean;
  isSectionVisible: (id: string) => boolean;
  cards: OverviewOption[];
  sections: OverviewOption[];
  toggleCard: (id: string) => void;
  toggleSection: (id: string) => void;
};

const OverviewVisibilityContext = createContext<OverviewVisibility | null>(null);

function useOverviewVisibility() {
  const value = useContext(OverviewVisibilityContext);
  if (!value) throw new Error("Overview components must be rendered inside <OverviewCustomization>.");
  return value;
}

/**
 * Holds which overview cards and sections the user has chosen to show.
 * Choices persist per user and business (localStorage plus the preferences
 * API), using the same mechanism as table column visibility. Cards keep the
 * existing `overview-cards` key so earlier choices are preserved.
 */
export function OverviewCustomization({
  businessId,
  cards,
  sections,
  cardSnapshot,
  sectionSnapshot,
  children,
}: {
  businessId: string;
  cards: OverviewOption[];
  sections: OverviewOption[];
  cardSnapshot?: ColumnVisibility;
  sectionSnapshot?: ColumnVisibility;
  children: ReactNode;
}) {
  const cardDefaults = useMemo(() => Object.fromEntries(cards.map((card) => [card.id, true])), [cards]);
  const sectionDefaults = useMemo(() => Object.fromEntries(sections.map((section) => [section.id, true])), [sections]);
  const cardState = useColumnVisibility("overview-cards", cardDefaults, { businessId, serverSnapshot: cardSnapshot });
  const sectionState = useColumnVisibility("overview-sections", sectionDefaults, { businessId, serverSnapshot: sectionSnapshot });

  const value = useMemo<OverviewVisibility>(() => ({
    isCardVisible: (id) => cardState.visibility[id] !== false,
    isSectionVisible: (id) => sectionState.visibility[id] !== false,
    cards,
    sections,
    toggleCard: cardState.toggle,
    toggleSection: sectionState.toggle,
  }), [cardState.visibility, cardState.toggle, sectionState.visibility, sectionState.toggle, cards, sections]);

  return <OverviewVisibilityContext.Provider value={value}>{children}</OverviewVisibilityContext.Provider>;
}

/** "Customize" menu listing every card and section with a checkmark toggle. */
export function OverviewCustomizeMenu() {
  const { cards, sections, isCardVisible, isSectionVisible, toggleCard, toggleSection } = useOverviewVisibility();
  const hidden = cards.filter((card) => !isCardVisible(card.id)).length + sections.filter((section) => !isSectionVisible(section.id)).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-3.5" /> Customize
          {hidden > 0 ? <span className="rounded-full bg-surface-muted px-1.5 text-[11px] text-muted-foreground">{hidden} hidden</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {cards.length > 0 ? <DropdownMenuLabel>Summary cards</DropdownMenuLabel> : null}
        {cards.map((card) => (
          <ToggleItem key={card.id} label={card.label} checked={isCardVisible(card.id)} onToggle={() => toggleCard(card.id)} />
        ))}
        {cards.length > 0 && sections.length > 0 ? <DropdownMenuSeparator /> : null}
        {sections.length > 0 ? <DropdownMenuLabel>Sections</DropdownMenuLabel> : null}
        {sections.map((section) => (
          <ToggleItem key={section.id} label={section.label} checked={isSectionVisible(section.id)} onToggle={() => toggleSection(section.id)} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToggleItem({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={checked}
      onSelect={(event) => {
        event.preventDefault();
        onToggle();
      }}
    >
      <span className="grid w-4 place-items-center">{checked ? <Check className="size-3.5" /> : null}</span>
      {label}
    </DropdownMenuItem>
  );
}

/** Renders its children only while the section is switched on. */
export function OverviewSection({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { isSectionVisible } = useOverviewVisibility();
  if (!isSectionVisible(id)) return null;
  return className ? <div className={className}>{children}</div> : <>{children}</>;
}

/** Card visibility for the KPI grid. */
export function useOverviewCardVisibility() {
  const { isCardVisible } = useOverviewVisibility();
  return isCardVisible;
}
