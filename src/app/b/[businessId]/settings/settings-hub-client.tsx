"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  Coins,
  FileInput,
  FileText,
  LayoutGrid,
  ListOrdered,
  ListPlus,
  Percent,
  ReceiptText,
  Search,
  ShieldCheck,
  Sun,
  X,
  Lock,
  Mail,
  Ruler,
  Scale,
  CalendarClock,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ResolvedBusinessProfile } from "@/modules/business-profile/business-profile-service";

type SettingItem = {
  title: string;
  description: string;
  href: string;
  icon: typeof Building2;
  keywords: string;
  badge?: string;
};

type SettingGroup = {
  category: string;
  description: string;
  items: SettingItem[];
};

export function SettingsHubClient({
  businessId,
  profile,
  vatRegistered,
}: {
  businessId: string;
  profile: ResolvedBusinessProfile;
  vatRegistered: boolean;
}) {
  const [query, setQuery] = useState("");

  const groups: SettingGroup[] = useMemo(
    () => [
      {
        category: "Organization & Profile",
        description: "Company legal details, localization, calendar conventions, and app styling.",
        items: [
          {
            title: "Business Profile & Branding",
            description: "Company legal name, trading name, registered address, tax ID, and corporate logo.",
            href: `/b/${businessId}/settings/business-profile`,
            icon: Building2,
            keywords: "profile company name trading address phone email website logo branding registration trn",
            badge: profile.tradingName || profile.legalName ? "Configured" : "Needs setup",
          },
          {
            title: "Regional & Localization",
            description: "Date format, 12h/24h time formatting, and financial year start month.",
            href: `/b/${businessId}/settings/localization`,
            icon: Calendar,
            keywords: "date time format calendar fiscal financial year regional timezone",
            badge: profile.dateFormat,
          },
          {
            title: "Appearance & Theme",
            description: "Dark/light mode switcher, typography font family, text scaling, and table density.",
            href: `/b/${businessId}/settings/appearance`,
            icon: Sun,
            keywords: "appearance theme dark light font size text density display style",
          },
        ],
      },
      {
        category: "Commercial & Documents",
        description: "Sequence allocators, document layout presets, and custom fields.",
        items: [
          {
            title: "Document Numbering",
            description: "Prefixes, padding, and atomic next-number allocators for all 16 sales, purchase, and GL sequences.",
            href: `/b/${businessId}/settings/numbering`,
            icon: ListOrdered,
            keywords: "numbering prefix padding sequence invoice quote order bill receipt payment debit credit",
          },
          {
            title: "Form Defaults",
            description: "Configure line toggles, tax code selector visibility, payment terms, and standard notes/terms.",
            href: `/b/${businessId}/settings/form-defaults`,
            icon: FileInput,
            keywords: "form defaults line toggles payment terms tax code notes terms discounts",
          },
          {
            title: "Document Templates & PDF",
            description: "Customize PDF invoices, quotations, delivery notes, and purchase orders with branding colors and layouts.",
            href: `/b/${businessId}/settings/document-templates`,
            icon: FileText,
            keywords: "template pdf invoice print layout color modern classic statement html design",
          },
          {
            title: "Payment Terms",
            description: "Configure default settlement terms (Net 30, End of Month, Due on Receipt) with auto-due-date calculation.",
            href: `/b/${businessId}/settings/payment-terms`,
            icon: CalendarClock,
            keywords: "payment terms net 30 due date credit terms settlement",
          },
          {
            title: "Units of Measure",
            description: "Standard packaging and physical units (pcs, hrs, kg, boxes) for products and commercial documents.",
            href: `/b/${businessId}/settings/units-of-measure`,
            icon: Ruler,
            keywords: "units of measure uom pcs kg hours boxes packaging",
          },
          {
            title: "Email Templates",
            description: "Customize dispatch messages and subject lines with dynamic tokens (customer name, document number, total, balance due).",
            href: `/b/${businessId}/settings/email-templates`,
            icon: Mail,
            keywords: "email templates tokens customer invoice quote dispatch messages",
          },
          {
            title: "Custom Fields",
            description: "Add custom attributes to customers, suppliers, invoices, quotes, and purchase orders.",
            href: `/b/${businessId}/settings/custom-fields`,
            icon: ListPlus,
            keywords: "custom fields attributes metadata extra columns",
          },
        ],
      },
      {
        category: "Accounting & Tax",
        description: "Currencies, dated foreign exchange rates, UAE VAT compliance, and tax account codes.",
        items: [
          {
            title: "Currencies & Exchange Rates",
            description: "Master currencies, base currency configuration, dated FX rates, and realized FX gain/loss accounts.",
            href: `/b/${businessId}/settings/currencies`,
            icon: Coins,
            keywords: "currency currencies exchange rate fx foreign base rate aed usd eur",
            badge: profile.baseCurrency,
          },
          {
            title: "Lock Date (Period Closing)",
            description: "Prevent retroactive changes, back-dated edits, or ledger transactions prior to closed financial periods.",
            href: `/b/${businessId}/settings/lock-date`,
            icon: Lock,
            keywords: "lock date period closing financial lock prevent edits freeze period",
          },
          {
            title: "Guided Opening Balances",
            description: "Onboarding balance engine with live debit/credit reconciliation and automated suspense balancing.",
            href: `/b/${businessId}/settings/opening-balances`,
            icon: Scale,
            keywords: "opening balances suspense equity reconciliation ledger setup onboarding",
          },
          {
            title: "UAE VAT Settings",
            description: "Tax registration number (TRN), effective dates, default supply Emirate, and tax lock date.",
            href: `/b/${businessId}/settings/tax`,
            icon: ReceiptText,
            keywords: "vat tax uae trn registration emirate lock audit compliance fta",
            badge: vatRegistered ? "VAT registered" : "Not registered",
          },
          {
            title: "Tax Codes",
            description: "Maintain sales/purchase tax rates (5% Standard, Zero-Rated, Exempt, Reverse Charge) and GL accounts.",
            href: `/b/${businessId}/settings/tax-codes`,
            icon: Percent,
            keywords: "tax codes rate percent vat output input standard zero exempt reverse",
          },
        ],
      },
      {
        category: "Workspace & Access",
        description: "Team memberships, permission roles, and synchronized account UI preferences.",
        items: [
          {
            title: "Users & Access Control",
            description: "Assign team members, administrator/standard roles, and module access permissions.",
            href: `/b/${businessId}/settings/users`,
            icon: ShieldCheck,
            keywords: "users members access roles permissions admin security",
          },
          {
            title: "Display Preferences",
            description: "Per-user column visibility and KPI card toggles synced across devices. One-click reset to defaults.",
            href: `/b/${businessId}/settings/preferences`,
            icon: LayoutGrid,
            keywords: "preferences columns kpi cards reset ui view display sync",
          },
        ],
      },
    ],
    [businessId, profile, vatRegistered],
  );

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.toLowerCase().trim();
    return groups
      .map((group) => {
        const matchingItems = group.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.keywords.toLowerCase().includes(q),
        );
        return { ...group, items: matchingItems };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const totalResults = filteredGroups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="space-y-6">
      {/* Top Organization Snapshot Banner */}
      <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-base">
              {(profile.tradingName || profile.legalName || "ERP").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {profile.tradingName || profile.legalName || "Business Settings"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {[profile.city, profile.stateOrEmirate, profile.country].filter(Boolean).join(", ") ||
                  "Business Accounting & Document Settings"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Base: {profile.baseCurrency}</Badge>
            <Badge tone={vatRegistered ? "success" : "neutral"}>
              {vatRegistered ? `TRN: ${profile.taxId || "Registered"}` : "Non-VAT"}
            </Badge>
            <Badge tone="neutral">Date: {profile.dateFormat}</Badge>
          </div>
        </div>
      </div>

      {/* Quick Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter settings by keyword (e.g. TRN, logo, numbering, date format, VAT, theme, users)…"
          className="h-10 w-full rounded-lg border border-border bg-surface-raised pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Categorized Settings Grid */}
      {filteredGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
          <p className="text-sm font-semibold text-foreground">No settings match &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-xs text-muted-foreground">Try searching with a different keyword or clear the search.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {query.trim() && (
            <p className="text-xs text-muted-foreground">
              Showing {totalResults} setting{totalResults === 1 ? "" : "s"} matching &ldquo;{query}&rdquo;
            </p>
          )}

          {filteredGroups.map((group) => (
            <section key={group.category} className="space-y-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{group.category}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="group relative flex items-start gap-4 rounded-lg border border-border bg-surface-raised p-4 transition-all hover:border-border-strong hover:bg-surface-muted/50 hover:shadow-xs"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground transition-transform group-hover:scale-105">
                      <item.icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{item.title}</span>
                        {item.badge && (
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground mt-0.5" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
