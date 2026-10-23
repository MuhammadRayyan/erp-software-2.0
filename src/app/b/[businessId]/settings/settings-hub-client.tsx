"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Building2,
  Calendar,
  CalendarClock,
  ChevronRight,
  Coins,
  FileInput,
  FileText,
  History,
  Layers,
  LayoutGrid,
  ListOrdered,
  ListPlus,
  Lock,
  Mail,
  Percent,
  ReceiptText,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
  Wand2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ResolvedBusinessProfile } from "@/modules/business-profile/business-profile-service";

type SettingItem = {
  title: string;
  subtitle: string;
  href: string;
  icon: typeof Building2;
  keywords: string;
  badge?: string;
  tone?: "info" | "success" | "neutral" | "warning";
};

type SettingGroup = {
  id: string;
  category: string;
  shortLabel: string;
  description: string;
  icon: typeof Building2;
  items: SettingItem[];
};

export function SettingsHubClient({
  businessId,
  profile,
  vatRegistered,
  isSuperAdmin = false,
  isAdmin = true,
  initialTab,
  initialQuery,
}: {
  businessId: string;
  profile: ResolvedBusinessProfile;
  vatRegistered: boolean;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  initialTab?: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [activeTab, setActiveTab] = useState<string>(initialTab || "all");

  const groups: SettingGroup[] = useMemo(
    () => [
      {
        id: "business",
        category: "Business & Regional",
        shortLabel: "Business",
        description: "Company details, regional calendars, theme, and synchronized display settings.",
        icon: Building2,
        items: [
          {
            title: "Business Profile & Branding",
            subtitle: "Company legal name, address, tax ID, and logo",
            href: `/b/${businessId}/settings/business-profile`,
            icon: Building2,
            keywords: "profile company name trading address phone email website logo branding registration trn",
            badge: profile.tradingName || profile.legalName ? "Configured" : "Needs setup",
            tone: profile.tradingName || profile.legalName ? "success" : "warning",
          },
          {
            title: "Regional & Localization",
            subtitle: "Date/time formats and fiscal year start",
            href: `/b/${businessId}/settings/localization`,
            icon: Calendar,
            keywords: "date time format calendar fiscal financial year regional timezone",
            badge: profile.dateFormat,
            tone: "neutral",
          },
          {
            title: "Appearance & Theme",
            subtitle: "Dark/light mode, font family, and scale",
            href: `/b/${businessId}/settings/appearance`,
            icon: Sun,
            keywords: "appearance theme dark light font size text density display style",
          },
          {
            title: "Display Preferences",
            subtitle: "Column visibility and KPI card toggles",
            href: `/b/${businessId}/settings/preferences`,
            icon: LayoutGrid,
            keywords: "preferences columns kpi cards reset ui view display sync",
          },
        ],
      },
      {
        id: "tax-currency",
        category: "Tax & Currencies",
        shortLabel: "Tax & FX",
        description: "UAE FTA VAT compliance, tax rates, foreign exchange currencies, and lock date.",
        icon: Coins,
        items: [
          {
            title: "UAE VAT Settings",
            subtitle: "TRN, default Emirate, and FTA Form 201 compliance",
            href: `/b/${businessId}/settings/tax`,
            icon: ReceiptText,
            keywords: "vat tax uae trn registration emirate lock audit compliance fta",
            badge: vatRegistered ? "VAT Registered" : "Non-VAT",
            tone: vatRegistered ? "success" : "neutral",
          },
          {
            title: "Tax Codes & Rates",
            subtitle: "5% standard, zero-rated, exempt, and reverse charge",
            href: `/b/${businessId}/settings/tax-codes`,
            icon: Percent,
            keywords: "tax codes rate percent vat output input standard zero exempt reverse",
          },
          {
            title: "Currencies & FX Rates",
            subtitle: "Base currency, multi-currency tables, and daily rates",
            href: `/b/${businessId}/settings/currencies`,
            icon: Coins,
            keywords: "currency currencies exchange rate fx foreign base rate aed usd eur",
            badge: profile.baseCurrency,
            tone: "info",
          },
          {
            title: "Financial Lock Date",
            subtitle: "Freeze historical general ledger periods",
            href: `/b/${businessId}/settings/lock-date`,
            icon: Lock,
            keywords: "lock date period closing financial lock prevent edits freeze period",
          },
        ],
      },
      {
        id: "documents",
        category: "Documents & Forms",
        shortLabel: "Documents",
        description: "Document numbering sequences, PDF templates, standard terms, and custom attributes.",
        icon: FileText,
        items: [
          {
            title: "Document Numbering",
            subtitle: "Atomic sequential numbering across all 16 sequences",
            href: `/b/${businessId}/settings/numbering`,
            icon: ListOrdered,
            keywords: "numbering prefix padding sequence invoice quote order bill receipt payment debit credit",
          },
          {
            title: "Document Templates & PDF",
            subtitle: "PDF presentation, branding colors, and paper layout",
            href: `/b/${businessId}/settings/document-templates`,
            icon: FileText,
            keywords: "template pdf invoice print layout color modern classic statement html design paper letterhead",
          },
          {
            title: "Form Defaults",
            subtitle: "Default line toggles, accounts, notes, and terms",
            href: `/b/${businessId}/settings/form-defaults`,
            icon: FileInput,
            keywords: "form defaults line toggles payment terms tax code notes terms discounts",
          },
          {
            title: "Payment Terms",
            subtitle: "Net 30, End of Month, and automated due dates",
            href: `/b/${businessId}/settings/payment-terms`,
            icon: CalendarClock,
            keywords: "payment terms net 30 due date credit terms settlement",
          },
          {
            title: "Units of Measure",
            subtitle: "Packaging units (pcs, hrs, kg, boxes, meters)",
            href: `/b/${businessId}/settings/units-of-measure`,
            icon: Ruler,
            keywords: "units of measure uom pcs kg hours boxes packaging",
          },
          {
            title: "Custom Fields",
            subtitle: "Add custom attributes and metadata columns",
            href: `/b/${businessId}/settings/custom-fields`,
            icon: ListPlus,
            keywords: "custom fields attributes metadata extra columns",
          },
        ],
      },
      {
        id: "communications",
        category: "Email & Communications",
        shortLabel: "Email",
        description: "Connect business SMTP providers and configure outbound document emails.",
        icon: Mail,
        items: [
          {
            title: "Email & SMTP Settings",
            subtitle: "Hostinger, Gmail, Outlook, or Amazon SES relay",
            href: `/b/${businessId}/settings/email`,
            icon: Mail,
            keywords: "email smtp mail hostinger gmail outlook send server credentials outbound dispatch",
          },
          {
            title: "Email Dispatch Templates",
            subtitle: "Customize body and subject lines with dynamic tokens",
            href: `/b/${businessId}/settings/email-templates`,
            icon: Mail,
            keywords: "email templates tokens customer invoice quote dispatch messages",
          },
        ],
      },
      {
        id: "accounting",
        category: "Accounting & Rules",
        shortLabel: "Accounting",
        description: "Opening balances, suspense reconciliation, and bank statement categorization.",
        icon: Scale,
        items: [
          {
            title: "Guided Opening Balances",
            subtitle: "Onboarding debit/credit balance reconciliation",
            href: `/b/${businessId}/settings/opening-balances`,
            icon: Scale,
            keywords: "opening balances suspense equity reconciliation ledger setup onboarding",
          },
          {
            title: "Bank Rules & Categorization",
            subtitle: "Auto-categorize bank statement transaction lines",
            href: `/b/${businessId}/settings/bank-rules`,
            icon: Wand2,
            keywords: "bank rules auto categorization matching automatic statement line rules reconciliation manager import",
          },
        ],
      },
      {
        id: "system",
        category: "Users & System",
        shortLabel: "Team & System",
        description: "User accounts, role permissions, activity logs, and system health.",
        icon: ShieldCheck,
        items: [
          {
            title: "My Profile & Security",
            subtitle: "Account credentials, name, and password",
            href: `/b/${businessId}/settings/profile`,
            icon: UserRound,
            keywords: "profile user account password change security name credentials",
          },
          ...(isAdmin
            ? [
                {
                  title: "Users & Access Control",
                  subtitle: "Team member roles and module permissions",
                  href: `/b/${businessId}/settings/users`,
                  icon: ShieldCheck,
                  keywords: "users members access roles permissions admin security",
                },
              ]
            : []),
          {
            title: "Activity & Audit Log",
            subtitle: "Complete transaction and operation audit trail",
            href: `/b/${businessId}/settings/activity-log`,
            icon: History,
            keywords: "activity audit log history user trail tracking actions operations inspection",
          },
          ...(isSuperAdmin
            ? [
                {
                  title: "System Health & Diagnostics",
                  subtitle: "WAL metrics, memory, uptime, and database telemetry",
                  href: `/b/${businessId}/settings/system-health`,
                  icon: Activity,
                  keywords: "system health diagnostics logs traces sentry memory database wal uptime",
                  badge: "Operational",
                  tone: "success" as const,
                },
              ]
            : []),
        ],
      },
    ],
    [businessId, profile, vatRegistered, isSuperAdmin, isAdmin],
  );

  const totalAllItems = useMemo(
    () => groups.reduce((acc, g) => acc + g.items.length, 0),
    [groups],
  );

  const tabs = useMemo(
    () => [
      { id: "all", label: "All Settings", icon: Layers, count: totalAllItems },
      ...groups.map((g) => ({
        id: g.id,
        label: g.shortLabel,
        icon: g.icon,
        count: g.items.length,
      })),
    ],
    [groups, totalAllItems],
  );

  const visibleGroups = useMemo(() => {
    let result = groups;
    if (activeTab !== "all") {
      result = result.filter((g) => g.id === activeTab);
    }
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      result = result
        .map((group) => {
          const matchingItems = group.items.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.subtitle.toLowerCase().includes(q) ||
              item.keywords.toLowerCase().includes(q),
          );
          return { ...group, items: matchingItems };
        })
        .filter((group) => group.items.length > 0);
    }
    return result;
  }, [groups, activeTab, query]);

  const totalResults = visibleGroups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="space-y-5">
      {/* Top Organization Compact Snapshot Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
            {(profile.tradingName || profile.legalName || "ERP").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {profile.tradingName || profile.legalName || "Business Settings"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {[profile.city, profile.stateOrEmirate, profile.country].filter(Boolean).join(", ") ||
                "UAE Accounting & Document Configuration"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info" className="text-xs font-medium px-2 py-0.5">
            Base: {profile.baseCurrency}
          </Badge>
          <Badge tone={vatRegistered ? "success" : "neutral"} className="text-xs font-medium px-2 py-0.5">
            {vatRegistered ? `TRN: ${profile.taxId || "Registered"}` : "Non-VAT"}
          </Badge>
          <Badge tone="neutral" className="text-xs font-medium px-2 py-0.5">
            {profile.dateFormat}
          </Badge>
          <span className="text-xs text-muted-foreground ml-1">
            {totalAllItems} options
          </span>
        </div>
      </div>

      {/* Search & Subpage Filter Toolbar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings (e.g. TRN, logo, numbering, date format, VAT, email, bank rules, users)…"
            className="h-10 w-full rounded-lg border border-border bg-surface-raised pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Manager.io-Style Compact Category Subpage Pills */}
        <div
          role="tablist"
          aria-label="Settings subpages"
          className="flex flex-wrap items-center gap-1.5 border-b border-border/80 pb-2.5"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    if (tab.id === "all") {
                      url.searchParams.delete("tab");
                    } else {
                      url.searchParams.set("tab", tab.id);
                    }
                    window.history.replaceState(null, "", url.toString());
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-surface-raised border border-border/70 text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                <tab.icon className="size-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Settings Content */}
      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No settings match &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-xs text-muted-foreground">Try searching with another keyword or select a different category.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveTab("all");
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.delete("tab");
                url.searchParams.delete("q");
                window.history.replaceState(null, "", url.toString());
              }
            }}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Clear search & show all settings
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {query.trim() && (
            <p className="text-xs font-medium text-muted-foreground">
              Showing {totalResults} setting{totalResults === 1 ? "" : "s"} matching &ldquo;{query}&rdquo;
            </p>
          )}

          {visibleGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-border bg-surface-raised shadow-xs p-4 sm:p-5 space-y-3"
            >
              {/* Category Header */}
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                    <group.icon className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-foreground">{group.category}</h3>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-foreground shrink-0 hidden sm:inline">
                  {group.items.length} {group.items.length === 1 ? "item" : "items"}
                </span>
              </div>

              {/* Compact Manager.io Grid */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="group relative flex items-center justify-between rounded-lg border border-border/70 bg-surface px-3 py-2.5 transition-all duration-150 hover:border-primary/50 hover:bg-surface-muted/50 hover:shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-muted border border-border/50 text-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
                        <item.icon className="size-4" />
                      </div>
                      <div className="min-w-0 pr-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {item.title}
                          </h4>
                          {item.badge && (
                            <Badge
                              tone={item.tone ?? "neutral"}
                              className="text-[10px] font-medium px-1.5 py-0 leading-tight shrink-0"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-primary group-hover:translate-x-0.5" />
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
