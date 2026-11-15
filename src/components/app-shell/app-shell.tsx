"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Banknote,
  BookOpenText,
  Building2,
  CircleHelp,
  ContactRound,
  FileInput,
  FileText,
  FolderKanban,
  Globe,
  HandCoins,
  Hash,
  History,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { CommandPalette, type CommandItem } from "@/components/command-palette";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModuleKey } from "@/core/permissions/permissions";
import { AccountMenu } from "@/components/account-menu";
import { customizeNav, primaryNav, settingsNav, systemHealthNav } from "./nav-items";
import { isNavPathVisible, resolveDefaultLandingPath } from "./nav-customization";
import { SidebarNav } from "./sidebar-nav";
import { NotificationBell } from "./notification-bell";
import { cn } from "@/lib/cn";

const SIDEBAR_STORAGE_KEY = "uaemanager.sidebarCollapsed";
const SIDEBAR_COOKIE_NAME = "ui-sidebar-collapsed";

type BusinessOption = { id: string; name: string };

type ShellProps = {
  children: React.ReactNode;
  business: BusinessOption;
  initialSidebarCollapsed?: boolean;
  modules: ModuleKey[];
  hiddenNavPaths?: readonly string[];
  user: { name: string; email: string; isSuperAdmin?: boolean };
  unreadNotificationsCount?: number;
  pendingApprovalsCount?: number;
};

function buildCommands(
  business: BusinessOption,
  modules: ModuleKey[],
  hiddenNavPaths: readonly string[],
  isSuperAdmin: boolean,
  push: (path: string) => void,
): CommandItem[] {
  const go = (path: string) => () => push(`/b/${business.id}${path}`);
  const navigation: CommandItem[] = [];
  for (const group of primaryNav) {
    for (const item of group.items) {
      if (!isNavPathVisible(item.path, hiddenNavPaths)) continue;
      if (item.modules && !item.modules.some((m) => modules.includes(m))) continue;
      if (item.module && !modules.includes(item.module)) continue;
      navigation.push({
        group: "Navigation",
        label: item.label,
        hint: group.label ?? "Overview",
        icon: item.icon,
        keywords: [group.label, item.label, item.path].filter(Boolean).join(" "),
        onSelect: go(item.path),
      });
    }
  }

  const settings: CommandItem[] = [];
  if (modules.includes("settings")) {
    settings.push(
      { group: "Settings", label: customizeNav.label, hint: "Modules", icon: customizeNav.icon, keywords: "customize hide show modules tabs sidebar", onSelect: go(customizeNav.path) },
      { group: "Settings", label: settingsNav.label, hint: "Hub", icon: settingsNav.icon, keywords: "settings preferences configuration", onSelect: go(settingsNav.path) },
      { group: "Settings", label: "Business Profile", hint: "Business", icon: Building2, keywords: "business profile trn address logo legal name", onSelect: go("/settings/business-profile") },
      { group: "Settings", label: "Appearance & Theme", hint: "Personal", icon: Palette, keywords: "theme dark light mode font size density", onSelect: go("/settings/appearance") },
      { group: "Settings", label: "Display Preferences", hint: "This business", icon: SlidersHorizontal, keywords: "columns kpi preferences reset", onSelect: go("/settings/preferences") },
      { group: "Settings", label: "Tax & VAT", hint: "Settings", icon: BookOpenText, keywords: "vat tax registration trn", onSelect: go("/settings/tax") },
      { group: "Settings", label: "Tax Codes", hint: "Settings", icon: BookOpenText, keywords: "tax codes vat rate zero exempt", onSelect: go("/settings/tax-codes") },
      { group: "Settings", label: "Currencies & FX", hint: "Settings", icon: Globe, keywords: "currency exchange rate aed usd cbuae", onSelect: go("/settings/currencies") },
      { group: "Settings", label: "Document Numbering", hint: "Settings", icon: Hash, keywords: "numbering sequence prefix", onSelect: go("/settings/numbering") },
      { group: "Settings", label: "Form Defaults", hint: "Settings", icon: FileText, keywords: "form defaults terms notes columns", onSelect: go("/settings/form-defaults") },
      { group: "Settings", label: "Document Templates", hint: "Settings", icon: FileText, keywords: "templates pdf print branding", onSelect: go("/settings/document-templates") },
      { group: "Settings", label: "Users & Access Control", hint: "Admin", icon: Users, keywords: "users roles permissions invite", onSelect: go("/settings/users") },
    );
    if (isSuperAdmin) {
      settings.push(
        { group: "Settings", label: systemHealthNav.label, hint: "Diagnostics", icon: systemHealthNav.icon, keywords: "system health diagnostics logs traces metrics wal", onSelect: go(systemHealthNav.path) },
        { group: "Settings", label: "Platform Admin Console", hint: "Super Admin", icon: Activity, keywords: "admin tenants engine health", onSelect: () => push("/admin") },
      );
    }
  }
  settings.push(
    { group: "Settings", label: "My Profile & Security", hint: "Personal", icon: UserRound, keywords: "profile user account password security name", onSelect: go("/settings/profile") },
    { group: "Settings", label: "Activity & Audit Log", hint: "Audit", icon: History, keywords: "activity audit log history user trail", onSelect: go("/settings/activity-log") },
  );

  const actions: CommandItem[] = [];
  if (modules.includes("sales")) {
    if (isNavPathVisible("/sales/invoices", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Invoice", hint: "Create", icon: ReceiptText, keywords: "new create add sales invoice", onSelect: go("/sales/invoices/new") });
    }
    if (isNavPathVisible("/sales/receipts", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "Record Receipt", hint: "Create", icon: Receipt, keywords: "new create add record customer receipt payment collection", onSelect: go("/sales/receipts/new") });
    }
    if (isNavPathVisible("/sales/quotes", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Sales Quote", hint: "Create", icon: ReceiptText, keywords: "new create add quote quotation sales", onSelect: go("/sales/quotes/new") });
    }
    if (isNavPathVisible("/sales/orders", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Sales Order", hint: "Create", icon: ShoppingCart, keywords: "new create add sales order", onSelect: go("/sales/orders/new") });
    }
    if (isNavPathVisible("/customers", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Customer", hint: "Create", icon: ContactRound, keywords: "new create add customer sales", onSelect: go("/customers/new") });
    }
  }
  if (modules.includes("purchases")) {
    if (isNavPathVisible("/purchases/invoices", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Purchase Invoice", hint: "Create", icon: FileInput, keywords: "new create add purchase invoice bill purchases", onSelect: go("/purchases/invoices/new") });
    }
    if (isNavPathVisible("/purchases/payments", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "Record Supplier Payment", hint: "Create", icon: HandCoins, keywords: "new create add record supplier vendor payment disbursement", onSelect: go("/purchases/payments/new") });
    }
    if (isNavPathVisible("/purchases/quotes", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Purchase Quote", hint: "Create", icon: FileText, keywords: "new create add purchase quote rfq", onSelect: go("/purchases/quotes/new") });
    }
    if (isNavPathVisible("/purchases/orders", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Purchase Order", hint: "Create", icon: ShoppingCart, keywords: "new create add purchase order", onSelect: go("/purchases/orders/new") });
    }
    if (isNavPathVisible("/suppliers", hiddenNavPaths)) {
      actions.push({ group: "Create", label: "New Supplier", hint: "Create", icon: Truck, keywords: "new create add supplier vendor purchases", onSelect: go("/suppliers/new") });
    }
  }
  if (modules.includes("banking") && isNavPathVisible("/banking/accounts", hiddenNavPaths)) {
    actions.push({ group: "Create", label: "New Bank Account", hint: "Create", icon: Banknote, keywords: "new create add bank account cash", onSelect: go("/banking/accounts/new") });
  }
  if (modules.includes("projects") && isNavPathVisible("/projects", hiddenNavPaths)) {
    actions.push({ group: "Create", label: "New Project", hint: "Create", icon: FolderKanban, keywords: "new create add project", onSelect: go("/projects/new") });
  }
  if (modules.includes("accounting") && isNavPathVisible("/accounting/journal", hiddenNavPaths)) {
    actions.push({ group: "Create", label: "New Journal Entry", hint: "Create", icon: BookOpenText, keywords: "new journal entry manual ledger", onSelect: go("/accounting/journal/new") });
  }

  return [...actions, ...navigation, ...settings];
}

function ActiveBusinessLabel({
  business,
  collapsed = false,
}: {
  business: BusinessOption;
  collapsed?: boolean;
}) {
  const initial = (business.name.trim()[0] ?? "B").toUpperCase();

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            aria-label={business.name}
            className="mx-auto flex size-9 items-center justify-center rounded-[7px] border border-border/80 bg-surface-raised text-xs font-bold text-primary"
          >
            {initial}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{business.name}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="px-2 py-1" aria-label={`Active business: ${business.name}`}>
      <p className="truncate text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">
        Active business
      </p>
      <p className="truncate text-xs font-semibold text-foreground">{business.name}</p>
    </div>
  );
}

export function AppShell({
  children,
  business,
  initialSidebarCollapsed = false,
  modules,
  hiddenNavPaths = [],
  user,
  unreadNotificationsCount = 0,
  pendingApprovalsCount = 0,
}: ShellProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const defaultLandingPath = useMemo(
    () => resolveDefaultLandingPath(hiddenNavPaths, new Set(modules)),
    [hiddenNavPaths, modules],
  );

  const commands = useMemo(
    () => buildCommands(business, modules, hiddenNavPaths, isSuperAdmin, (path) => router.push(path)),
    [business, modules, hiddenNavPaths, isSuperAdmin, router],
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === "1" || stored === "0") {
        const next = stored === "1";
        setSidebarCollapsed(next);
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${stored}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {
      // Ignore storage access failure.
    }
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      const serialized = next ? "1" : "0";
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, serialized);
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${serialized}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // Ignore storage write failure.
      }
      return next;
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-surface/95 px-3 backdrop-blur-sm lg:pl-4">
          <div className="flex w-full items-center gap-2">
            <DialogRoot open={mobileOpen} onOpenChange={setMobileOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="top-0 left-0 h-dvh w-[290px] max-w-[86vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
                <DialogTitle className="sr-only">Navigation</DialogTitle>
                <div className="flex h-full flex-col pt-4">
                  <div className="px-4 pb-3"><BrandMark /></div>
                  <div className="border-y border-border px-3 py-2">
                    <ActiveBusinessLabel business={business} />
                  </div>
                  <SidebarNav
                    businessId={business.id}
                    modules={modules}
                    hiddenNavPaths={hiddenNavPaths}
                    isSuperAdmin={isSuperAdmin}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </DialogContent>
            </DialogRoot>

            <Link href={`/b/${business.id}${defaultLandingPath}`} className="hidden w-[222px] shrink-0 lg:block">
              <BrandMark />
            </Link>
            <div className="min-w-0 flex-1 lg:hidden">
              <p className="truncate text-sm font-semibold">{business.name}</p>
            </div>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search or jump to (Ctrl K)"
              aria-keyshortcuts="Control+K"
              className="mx-auto hidden h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-left text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
            >
              <Search className="size-3.5" /> Search or jump to… <kbd className="ml-auto text-[11px]">Ctrl K</kbd>
            </button>

            {/* Unified mobile search trigger inside top header (no bottom-right floating FAB) */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Search or jump to (Ctrl K)"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-[18px]" />
            </Button>

            {pendingApprovalsCount > 0 && (
              <Button asChild variant="ghost" size="sm" className="hidden gap-1.5 text-xs sm:inline-flex">
                <Link href={`/b/${business.id}/approvals`} title="Pending Maker-Checker approvals">
                  <ShieldCheck className="size-4 text-warning" />
                  <span className="font-semibold tabular-nums">{pendingApprovalsCount}</span>
                </Link>
              </Button>
            )}
            <NotificationBell
              businessId={business.id}
              initialUnreadCount={unreadNotificationsCount}
            />
            <Button variant="ghost" size="icon" aria-label="Help" title="Help" onClick={() => setHelpOpen(true)}>
              <CircleHelp className="size-[18px]" />
            </Button>
            <AccountMenu user={user} businessId={business.id} />
          </div>
        </header>

        <div className="flex min-h-[calc(100dvh-3.5rem)]">
          <aside
            data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
            className={cn(
              "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 ease-out lg:flex",
              sidebarCollapsed ? "w-16" : "w-60",
            )}
          >
            <div className={cn("border-b border-border py-2", sidebarCollapsed ? "px-2" : "px-2.5")}>
              <ActiveBusinessLabel business={business} collapsed={sidebarCollapsed} />
            </div>

            <SidebarNav
              businessId={business.id}
              modules={modules}
              hiddenNavPaths={hiddenNavPaths}
              isSuperAdmin={isSuperAdmin}
              collapsed={sidebarCollapsed}
            />

            <div className={cn("border-t border-border py-1.5", sidebarCollapsed ? "px-1.5" : "px-2.5")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleSidebarCollapsed}
                    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-pressed={sidebarCollapsed}
                    className={cn(
                      "flex h-8 w-full items-center rounded-[6px] text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      sidebarCollapsed ? "mx-auto size-9 justify-center px-0" : "gap-2 px-2.5",
                    )}
                  >
                    {sidebarCollapsed ? (
                      <PanelLeftOpen className="size-4 shrink-0" />
                    ) : (
                      <>
                        <PanelLeftClose className="size-4 shrink-0" />
                        <span className="truncate">Collapse rail</span>
                      </>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {sidebarCollapsed ? "Expand sidebar" : "Collapse to icon rail"}
                </TooltipContent>
              </Tooltip>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
        </div>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={commands} />

        <DialogRoot open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent>
            <DialogTitle>Help</DialogTitle>
            <DialogDescription>The essentials for getting around UAE Manager.</DialogDescription>
            <div className="mt-4 space-y-4 text-sm">
              <section>
                <h3 className="font-semibold">Getting started</h3>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-5 text-muted-foreground">
                  <li>Create customers under Sales → Customers.</li>
                  <li>Raise an invoice from Sales → Invoices and post it.</li>
                  <li>Record a receipt against the invoice to settle it.</li>
                </ol>
              </section>
              <section>
                <h3 className="font-semibold">Keyboard shortcuts</h3>
                <ul className="mt-1.5 space-y-1 text-[13px] leading-5 text-muted-foreground">
                  <li className="flex items-center justify-between gap-4">
                    <span>Open the command palette</span>
                    <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">Ctrl K</kbd>
                  </li>
                  <li>In the palette: move with ↑ ↓, run with Enter, dismiss with Esc.</li>
                  <li>On mobile: tap the Search icon in the top header bar to open the palette.</li>
                </ul>
              </section>
              <p className="text-xs text-muted-foreground">Demo account: admin@demo.local</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setHelpOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </DialogRoot>
      </div>
    </TooltipProvider>
  );
}
