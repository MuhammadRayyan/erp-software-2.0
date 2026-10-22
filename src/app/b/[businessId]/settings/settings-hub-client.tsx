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
  Activity,
  Wand2,
  Layers,
  History,
  UserRound,
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
  id: string;
  category: string;
  description: string;
  icon: typeof Building2;
  items: SettingItem[];
};

export function SettingsHubClient({
  businessId,
  profile,
  vatRegistered,
  isSuperAdmin = false,
}: {
  businessId: string;
  profile: ResolvedBusinessProfile;
  vatRegistered: boolean;
  isSuperAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  const groups: SettingGroup[] = useMemo(
    () => [
      {
        id: "organization",
        category: "Company & Regional Settings",
        description: "Legal company details, branding, registered address, regional calendar formats, and visual theme styling.",
        icon: Building2,
        items: [
          {
            title: "Business Profile & Branding",
            description: "Company legal name, trading name, registered address, tax ID, and corporate logo for document headers.",
            href: `/b/${businessId}/settings/business-profile`,
            icon: Building2,
            keywords: "profile company name trading address phone email website logo branding registration trn",
            badge: profile.tradingName || profile.legalName ? "Configured" : "Needs setup",
          },
          {
            title: "Regional & Localization",
            description: "Date format (YYYY-MM-DD, DD/MM/YYYY), 12h/24h time formatting, and financial year start month.",
            href: `/b/${businessId}/settings/localization`,
            icon: Calendar,
            keywords: "date time format calendar fiscal financial year regional timezone",
            badge: profile.dateFormat,
          },
          {
            title: "Appearance & Theme",
            description: "Dark/light mode switcher, global typography font family (Inter, Roboto, etc.), and font scale multiplier.",
            href: `/b/${businessId}/settings/appearance`,
            icon: Sun,
            keywords: "appearance theme dark light font size text density display style",
          },
        ],
      },
      {
        id: "commercial",
        category: "Commercial & Document Defaults",
        description: "Document layouts, PDF presentation presets, sequential numbering sequences, payment terms, and custom metadata.",
        icon: FileText,
        items: [
          {
            title: "Document Templates & PDF",
            description: "Customize PDF invoices, quotations, delivery notes, and purchase orders with branding colors and realistic paper styling.",
            href: `/b/${businessId}/settings/document-templates`,
            icon: FileText,
            keywords: "template pdf invoice print layout color modern classic statement html design paper letterhead",
          },
          {
            title: "Document Numbering",
            description: "Prefixes, zero-padding, and atomic sequential next-number allocators across all 16 sales, purchase, and GL sequences.",
            href: `/b/${businessId}/settings/numbering`,
            icon: ListOrdered,
            keywords: "numbering prefix padding sequence invoice quote order bill receipt payment debit credit",
          },
          {
            title: "Form Defaults",
            description: "Configure default line toggles, tax code selector visibility, default accounts, and standard terms/notes for new documents.",
            href: `/b/${businessId}/settings/form-defaults`,
            icon: FileInput,
            keywords: "form defaults line toggles payment terms tax code notes terms discounts",
          },
          {
            title: "Payment Terms",
            description: "Configure standard settlement terms (Net 30, End of Month, Due on Receipt) with automated due-date calculations.",
            href: `/b/${businessId}/settings/payment-terms`,
            icon: CalendarClock,
            keywords: "payment terms net 30 due date credit terms settlement",
          },
          {
            title: "Units of Measure",
            description: "Standard packaging and physical units (pcs, hrs, kg, boxes, meters) for inventory products and line items.",
            href: `/b/${businessId}/settings/units-of-measure`,
            icon: Ruler,
            keywords: "units of measure uom pcs kg hours boxes packaging",
          },
          {
            title: "Email & SMTP Configuration",
            description: "Connect your business email provider (Hostinger, Google Workspace, Outlook, Amazon SES) and verify outbound message deliverability.",
            href: `/b/${businessId}/settings/email`,
            icon: Mail,
            keywords: "email smtp mail hostinger gmail outlook send server credentials outbound dispatch",
          },
          {
            title: "Email Dispatch Templates",
            description: "Customize dispatch email bodies and subject lines with dynamic tokens (customer name, document number, total, balance).",
            href: `/b/${businessId}/settings/email-templates`,
            icon: Mail,
            keywords: "email templates tokens customer invoice quote dispatch messages",
          },
          {
            title: "Custom Fields",
            description: "Add user-defined attributes and extra columns to customers, suppliers, invoices, quotes, and orders.",
            href: `/b/${businessId}/settings/custom-fields`,
            icon: ListPlus,
            keywords: "custom fields attributes metadata extra columns",
          },
        ],
      },
      {
        id: "finance",
        category: "Financial, Tax & Banking",
        description: "Master currencies, dated foreign exchange rates, UAE FTA VAT compliance, accounting period lock date, and bank rules.",
        icon: Coins,
        items: [
          {
            title: "Currencies & Exchange Rates",
            description: "Master currencies, base currency configuration, dated FX rates, and realized FX gain/loss GL mappings.",
            href: `/b/${businessId}/settings/currencies`,
            icon: Coins,
            keywords: "currency currencies exchange rate fx foreign base rate aed usd eur",
            badge: profile.baseCurrency,
          },
          {
            title: "UAE VAT Settings",
            description: "Tax registration number (TRN), effective dates, default supply Emirate, and tax lock date for FTA Form 201 compliance.",
            href: `/b/${businessId}/settings/tax`,
            icon: ReceiptText,
            keywords: "vat tax uae trn registration emirate lock audit compliance fta",
            badge: vatRegistered ? "VAT Registered" : "Not Registered",
          },
          {
            title: "Tax Codes & Rates",
            description: "Maintain sales/purchase tax rates (5% Standard, Zero-Rated, Exempt, Reverse Charge) and control accounts.",
            href: `/b/${businessId}/settings/tax-codes`,
            icon: Percent,
            keywords: "tax codes rate percent vat output input standard zero exempt reverse",
          },
          {
            title: "Financial Lock Date",
            description: "Close accounting periods to prevent retroactive additions, edits, or voiding to finalized general ledger books.",
            href: `/b/${businessId}/settings/lock-date`,
            icon: Lock,
            keywords: "lock date period closing financial lock prevent edits freeze period",
          },
          {
            title: "Guided Opening Balances",
            description: "Onboarding balance engine with live debit/credit reconciliation and automated suspense equity balancing.",
            href: `/b/${businessId}/settings/opening-balances`,
            icon: Scale,
            keywords: "opening balances suspense equity reconciliation ledger setup onboarding",
          },
          {
            title: "Bank Rules & Categorization",
            description: "Automate GL accounts, tax codes, and descriptions for recurring bank statement deposits and disbursements.",
            href: `/b/${businessId}/settings/bank-rules`,
            icon: Wand2,
            keywords: "bank rules auto categorization matching automatic statement line rules reconciliation manager import",
          },
        ],
      },
      {
        id: "system",
        category: "Workspace, Access & Diagnostics",
        description: "Team member access roles, per-account synchronized view preferences, and database WAL diagnostics.",
        icon: ShieldCheck,
        items: [
          {
            title: "My Profile & Security",
            description: "View account credentials, update your display name, and change account password.",
            href: `/b/${businessId}/settings/profile`,
            icon: UserRound,
            keywords: "profile user account password change security name credentials",
          },
          {
            title: "Users & Access Control",
            description: "Assign team members, administrator/standard roles, and module access permissions.",
            href: `/b/${businessId}/settings/users`,
            icon: ShieldCheck,
            keywords: "users members access roles permissions admin security",
          },
          {
            title: "Activity & Audit Log",
            description: "Track user actions, operations, invoice postings, and system audit trail across the workspace.",
            href: `/b/${businessId}/settings/activity-log`,
            icon: History,
            keywords: "activity audit log history user trail tracking actions operations inspection",
          },
          {
            title: "Display Preferences",
            description: "Per-user column visibility and KPI card toggles synchronized across devices with one-click reset.",
            href: `/b/${businessId}/settings/preferences`,
            icon: LayoutGrid,
            keywords: "preferences columns kpi cards reset ui view display sync",
          },
          ...(isSuperAdmin
            ? [
                {
                  title: "System Health & Diagnostics",
                  description: "Database WAL metrics, system memory, uptime status, correlated trace logs, and telemetry health.",
                  href: `/b/${businessId}/settings/system-health`,
                  icon: Activity,
                  keywords: "system health diagnostics logs traces sentry memory database wal uptime",
                  badge: "Operational",
                },
              ]
            : []),
        ],
      },
    ],
    [businessId, profile, vatRegistered, isSuperAdmin],
  );

  const tabs = useMemo(
    () => [
      { id: "all", label: "All Settings", icon: Layers, count: groups.reduce((acc, g) => acc + g.items.length, 0) },
      ...groups.map((g) => ({
        id: g.id,
        label: g.category.split("&")[0].trim(),
        icon: g.icon,
        count: g.items.length,
      })),
    ],
    [groups],
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
              item.description.toLowerCase().includes(q) ||
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
    <div className="space-y-8">
      {/* Top Organization Snapshot Banner */}
      <div className="rounded-2xl border border-border bg-surface-raised p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg">
              {(profile.tradingName || profile.legalName || "ERP").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {profile.tradingName || profile.legalName || "Business Settings"}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {[profile.city, profile.stateOrEmirate, profile.country].filter(Boolean).join(", ") ||
                  "Business Accounting & Document Settings"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info" className="text-xs font-semibold px-2.5 py-1">
              Base: {profile.baseCurrency}
            </Badge>
            <Badge tone={vatRegistered ? "success" : "neutral"} className="text-xs font-semibold px-2.5 py-1">
              {vatRegistered ? `TRN: ${profile.taxId || "Registered"}` : "Non-VAT"}
            </Badge>
            <Badge tone="neutral" className="text-xs font-semibold px-2.5 py-1">
              Date: {profile.dateFormat}
            </Badge>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings by keyword (e.g. TRN, logo, bank rules, numbering, date format, VAT, theme, users)…"
            className="h-11 w-full rounded-xl border border-border bg-surface-raised pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Global Standard Tabs */}
        <div
          role="tablist"
          aria-label="Settings categories"
          className="flex flex-wrap items-center gap-2 border-b border-border pb-3"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-raised border border-border/80 text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              <tab.icon className="size-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Settings Domain Cards */}
      {visibleGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="text-base font-semibold text-foreground">No settings match &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-sm text-muted-foreground">Try searching with a different keyword or reset the category filter.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveTab("all");
            }}
            className="mt-4 text-sm font-semibold text-primary hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {query.trim() && (
            <p className="text-sm font-medium text-muted-foreground">
              Showing {totalResults} setting{totalResults === 1 ? "" : "s"} matching &ldquo;{query}&rdquo;
            </p>
          )}

          {visibleGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-2xl border border-border bg-surface-raised shadow-xs p-6 sm:p-7 space-y-6"
            >
              {/* Main Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <group.icon className="size-6" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">{group.category}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{group.description}</p>
                  </div>
                </div>
                <Badge tone="neutral" className="text-xs font-semibold self-start sm:self-center">
                  {group.items.length} {group.items.length === 1 ? "Option" : "Options"}
                </Badge>
              </div>

              {/* Sub-Cards Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-surface p-5 transition-all duration-200 hover:border-primary/50 hover:bg-surface-muted/40 hover:shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-surface-muted border border-border/50 text-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
                          <item.icon className="size-5" />
                        </div>
                        {item.badge && (
                          <Badge tone="info" className="text-xs font-medium">
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <h4 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                          {item.title}
                        </h4>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary/80 group-hover:text-primary transition-colors">
                      <span>Configure</span>
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
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
