import {
  Activity,
  Building2,
  Calendar,
  CalendarClock,
  Coins,
  FileInput,
  FileText,
  History,
  LayoutGrid,
  ListOrdered,
  ListPlus,
  Lock,
  Mail,
  Percent,
  ReceiptText,
  Ruler,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserRound,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export type SettingBadgeTone = "info" | "success" | "neutral" | "warning";

export interface SettingEntry {
  id: string;
  title: string;
  subtitle: string;
  /** Path relative to `/b/[businessId]`, e.g. `/settings/business-profile` */
  path: string;
  icon: LucideIcon;
  keywords: string;
  hint?: string;
  requiresAdmin?: boolean;
  requiresSuperAdmin?: boolean;
  isPersonal?: boolean;
}

export interface SettingGroupDef {
  id: string;
  category: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  items: SettingEntry[];
}

export const SETTINGS_GROUPS: readonly SettingGroupDef[] = [
  {
    id: "business",
    category: "Business & Regional",
    shortLabel: "Business",
    description: "Company details, regional calendars, theme, and synchronized display settings.",
    icon: Building2,
    items: [
      {
        id: "customize",
        title: "Customize Modules",
        subtitle: "Show or hide modules and sub-tabs in workspace navigation",
        path: "/settings/customize",
        icon: SlidersHorizontal,
        keywords: "customize modules tabs hide show sidebar navigation menu",
        hint: "Modules",
      },
      {
        id: "business-profile",
        title: "Business Profile & Branding",
        subtitle: "Company legal name, address, tax ID, and logo",
        path: "/settings/business-profile",
        icon: Building2,
        keywords: "profile company name trading address phone email website logo branding registration trn",
        hint: "Business",
      },
      {
        id: "localization",
        title: "Regional & Localization",
        subtitle: "Date/time formats and fiscal year start",
        path: "/settings/localization",
        icon: Calendar,
        keywords: "date time format calendar fiscal financial year regional timezone",
        hint: "Regional",
      },
      {
        id: "appearance",
        title: "Appearance & Theme",
        subtitle: "Account-wide dark/light mode, font family, and scale across all businesses",
        path: "/settings/appearance",
        icon: Sun,
        keywords: "appearance theme dark light mode font size text density display style personal",
        hint: "Personal",
        isPersonal: true,
      },
      {
        id: "preferences",
        title: "Display Preferences",
        subtitle: "Per-business column visibility and KPI card toggles synced across devices",
        path: "/settings/preferences",
        icon: LayoutGrid,
        keywords: "preferences columns kpi cards reset ui view display sync business",
        hint: "Personal",
        isPersonal: true,
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
        id: "tax",
        title: "UAE VAT Settings",
        subtitle: "TRN, default Emirate, and FTA Form 201 compliance",
        path: "/settings/tax",
        icon: ReceiptText,
        keywords: "vat tax uae trn registration emirate lock audit compliance fta",
        hint: "Tax & FX",
      },
      {
        id: "tax-codes",
        title: "Tax Codes & Rates",
        subtitle: "5% standard, zero-rated, exempt, and reverse charge",
        path: "/settings/tax-codes",
        icon: Percent,
        keywords: "tax codes rate percent vat output input standard zero exempt reverse",
        hint: "Tax & FX",
      },
      {
        id: "currencies",
        title: "Currencies & FX Rates",
        subtitle: "Base currency, multi-currency tables, and daily rates",
        path: "/settings/currencies",
        icon: Coins,
        keywords: "currency currencies exchange rate fx foreign base rate aed usd eur cbuae",
        hint: "Tax & FX",
      },
      {
        id: "lock-date",
        title: "Financial Lock Date",
        subtitle: "Freeze historical general ledger periods",
        path: "/settings/lock-date",
        icon: Lock,
        keywords: "lock date period closing financial lock prevent edits freeze period",
        hint: "Closing",
        requiresAdmin: true,
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
        id: "numbering",
        title: "Document Numbering",
        subtitle: "Atomic sequential numbering across all 18 sequences",
        path: "/settings/numbering",
        icon: ListOrdered,
        keywords: "numbering prefix padding sequence invoice quote order bill receipt payment debit credit",
        hint: "Documents",
      },
      {
        id: "document-templates",
        title: "Document Templates & PDF",
        subtitle: "PDF presentation, branding colors, and paper layout",
        path: "/settings/document-templates",
        icon: FileText,
        keywords: "template pdf invoice print layout color modern classic statement html design paper letterhead",
        hint: "Documents",
        requiresAdmin: true,
      },
      {
        id: "form-defaults",
        title: "Form Defaults",
        subtitle: "Default line toggles, accounts, notes, and terms",
        path: "/settings/form-defaults",
        icon: FileInput,
        keywords: "form defaults line toggles payment terms tax code notes terms discounts",
        hint: "Documents",
      },
      {
        id: "payment-terms",
        title: "Payment Terms",
        subtitle: "Net 30, End of Month, and automated due dates",
        path: "/settings/payment-terms",
        icon: CalendarClock,
        keywords: "payment terms net 30 due date credit terms settlement",
        hint: "Documents",
      },
      {
        id: "units-of-measure",
        title: "Units of Measure",
        subtitle: "Packaging units (pcs, hrs, kg, boxes, meters)",
        path: "/settings/units-of-measure",
        icon: Ruler,
        keywords: "units of measure uom pcs kg hours boxes packaging",
        hint: "Documents",
      },
      {
        id: "custom-fields",
        title: "Custom Fields",
        subtitle: "Add custom attributes and metadata columns",
        path: "/settings/custom-fields",
        icon: ListPlus,
        keywords: "custom fields attributes metadata extra columns",
        hint: "Documents",
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
        id: "email",
        title: "Email & SMTP Settings",
        subtitle: "Hostinger, Gmail, Outlook, or Amazon SES relay",
        path: "/settings/email",
        icon: Mail,
        keywords: "email smtp mail hostinger gmail outlook send server credentials outbound dispatch",
        hint: "Email",
        requiresAdmin: true,
      },
      {
        id: "email-templates",
        title: "Email Dispatch Templates",
        subtitle: "Customize body and subject lines with dynamic tokens",
        path: "/settings/email-templates",
        icon: Mail,
        keywords: "email templates tokens customer invoice quote dispatch messages",
        hint: "Email",
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
        id: "opening-balances",
        title: "Guided Opening Balances",
        subtitle: "Onboarding debit/credit balance reconciliation",
        path: "/settings/opening-balances",
        icon: Scale,
        keywords: "opening balances suspense equity reconciliation ledger setup onboarding",
        hint: "Accounting",
      },
      {
        id: "bank-rules",
        title: "Bank Rules & Categorization",
        subtitle: "Auto-categorize bank statement transaction lines",
        path: "/settings/bank-rules",
        icon: Wand2,
        keywords: "bank rules auto categorization matching automatic statement line rules reconciliation manager import",
        hint: "Banking",
      },
      {
        id: "approvals",
        title: "Approval Rules & Thresholds",
        subtitle: "Maker-Checker spend limits and separation of duties",
        path: "/settings/approvals",
        icon: ShieldCheck,
        keywords: "approval maker checker threshold spend limits permissions workflow",
        hint: "Approvals",
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
        id: "profile",
        title: "My Profile & Security",
        subtitle: "Account-wide credentials, display name, and password",
        path: "/settings/profile",
        icon: UserRound,
        keywords: "profile user account password change security name credentials personal",
        hint: "Personal",
        isPersonal: true,
      },
      {
        id: "users",
        title: "Users & Access Control",
        subtitle: "Team member roles and module permissions",
        path: "/settings/users",
        icon: ShieldCheck,
        keywords: "users members access roles permissions admin security invite",
        hint: "Admin",
        requiresAdmin: true,
      },
      {
        id: "activity-log",
        title: "Activity & Audit Log",
        subtitle: "Complete transaction and operation audit trail",
        path: "/settings/activity-log",
        icon: History,
        keywords: "activity audit log history user trail tracking actions operations inspection",
        hint: "Audit",
        isPersonal: true,
      },
      {
        id: "system-health",
        title: "System Health & Diagnostics",
        subtitle: "WAL metrics, memory, uptime, and database telemetry",
        path: "/settings/system-health",
        icon: Activity,
        keywords: "system health diagnostics logs traces sentry memory database wal uptime",
        hint: "Diagnostics",
        requiresSuperAdmin: true,
      },
    ],
  },
];

export interface ResolvedSettingItem extends SettingEntry {
  href: string;
  groupId: string;
  groupCategory: string;
  groupShortLabel: string;
  badge?: string;
  tone?: SettingBadgeTone;
}

export interface ResolvedSettingGroup {
  id: string;
  category: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  items: ResolvedSettingItem[];
}

export function getVisibleSettingsGroups({
  businessId,
  vatRegistered = false,
  isAdmin = true,
  isSuperAdmin = false,
  hasSettingsModule = true,
}: {
  businessId: string;
  vatRegistered?: boolean;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  hasSettingsModule?: boolean;
}): ResolvedSettingGroup[] {
  const groups: ResolvedSettingGroup[] = [];

  for (const group of SETTINGS_GROUPS) {
    const items: ResolvedSettingItem[] = [];
    for (const item of group.items) {
      if (!hasSettingsModule && !item.isPersonal) continue;
      if (item.requiresAdmin && !isAdmin) continue;
      if (item.requiresSuperAdmin && !isSuperAdmin) continue;

      const resolved: ResolvedSettingItem = {
        ...item,
        href: `/b/${businessId}${item.path}`,
        groupId: group.id,
        groupCategory: group.category,
        groupShortLabel: group.shortLabel,
      };

      if (item.id === "tax") {
        resolved.badge = vatRegistered ? "VAT Registered" : "Non-VAT";
        resolved.tone = vatRegistered ? "success" : "neutral";
      }

      items.push(resolved);
    }

    if (items.length > 0) {
      groups.push({
        id: group.id,
        category: group.category,
        shortLabel: group.shortLabel,
        description: group.description,
        icon: group.icon,
        items,
      });
    }
  }

  return groups;
}

export function getFlatSettingsItems(options: {
  businessId: string;
  vatRegistered?: boolean;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  hasSettingsModule?: boolean;
}): ResolvedSettingItem[] {
  return getVisibleSettingsGroups(options).flatMap((group) => group.items);
}
