"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CircleHelp, ContactRound, FileInput, FolderKanban, HandCoins, History, Menu, Receipt, ReceiptText, Search, ShoppingCart, Truck, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { CommandPalette, type CommandItem } from "@/components/command-palette";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ModuleKey } from "@/core/permissions/permissions";
import { AccountMenu } from "@/components/account-menu";
import { primaryNav, settingsNav, systemHealthNav } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";
import { ModuleFlowGuide } from "@/components/module-flow-guide";

type ShellProps = {
  children: React.ReactNode;
  business: { id: string; name: string };
  businesses?: { id: string; name: string }[];
  modules: ModuleKey[];
  user: { name: string; email: string; isSuperAdmin?: boolean };
};

function buildCommands(businessId: string, modules: ModuleKey[], isSuperAdmin: boolean, push: (path: string) => void): CommandItem[] {
  const go = (path: string) => () => push(`/b/${businessId}${path}`);
  const navigation: CommandItem[] = [];
  for (const group of primaryNav) {
    for (const item of group.items) {
      if (item.module && !modules.includes(item.module)) continue;
      navigation.push({
        label: item.label,
        hint: "Go to",
        icon: item.icon,
        keywords: [group.label, item.label, item.path].filter(Boolean).join(" "),
        onSelect: go(item.path),
      });
    }
  }
  if (modules.includes("settings")) {
    navigation.push(
      { label: settingsNav.label, hint: "Go to", icon: settingsNav.icon, keywords: "settings preferences configuration", onSelect: go(settingsNav.path) },
    );
    if (isSuperAdmin) {
      navigation.push(
        { label: systemHealthNav.label, hint: "Go to", icon: systemHealthNav.icon, keywords: "system health diagnostics logs traces sentry metrics wal", onSelect: go(systemHealthNav.path) },
      );
    }
  }
  navigation.push(
    { label: "My Profile & Security", hint: "Go to", icon: UserRound, keywords: "profile user account password change security name credentials", onSelect: go("/settings/profile") },
    { label: "Activity & Audit Log", hint: "Go to", icon: History, keywords: "activity audit log history user trail tracking actions operations inspection", onSelect: go("/settings/activity-log") },
  );

  const actions: CommandItem[] = [];
  if (modules.includes("sales")) {
    actions.push(
      { label: "New Invoice", hint: "Create", icon: ReceiptText, keywords: "new create add sales invoice", onSelect: go("/sales/invoices/new") },
      { label: "Record Receipt", hint: "Create", icon: Receipt, keywords: "new create add record customer receipt payment collection", onSelect: go("/sales/receipts/new") },
      { label: "New Sales Quote", hint: "Create", icon: ReceiptText, keywords: "new create add quote quotation sales", onSelect: go("/sales/quotes/new") },
      { label: "New Sales Order", hint: "Create", icon: ShoppingCart, keywords: "new create add sales order", onSelect: go("/sales/orders/new") },
      { label: "New Customer", hint: "Create", icon: ContactRound, keywords: "new create add customer sales", onSelect: go("/customers/new") },
    );
  }
  if (modules.includes("purchases")) {
    actions.push(
      { label: "New Purchase Invoice", hint: "Create", icon: FileInput, keywords: "new create add purchase invoice bill purchases", onSelect: go("/purchases/invoices/new") },
      { label: "Record Supplier Payment", hint: "Create", icon: HandCoins, keywords: "new create add record supplier vendor payment disbursement", onSelect: go("/purchases/payments/new") },
      { label: "New Purchase Order", hint: "Create", icon: ShoppingCart, keywords: "new create add purchase order", onSelect: go("/purchases/orders/new") },
      { label: "New Supplier", hint: "Create", icon: Truck, keywords: "new create add supplier vendor purchases", onSelect: go("/suppliers/new") },
    );
  }
  if (modules.includes("banking")) {
    actions.push({ label: "New Bank Account", hint: "Create", icon: Banknote, keywords: "new create add bank account cash", onSelect: go("/banking/accounts/new") });
  }
  if (modules.includes("projects")) {
    actions.push({ label: "New Project", hint: "Create", icon: FolderKanban, keywords: "new create add project", onSelect: go("/projects/new") });
  }
  return [...navigation, ...actions];
}

export function AppShell({ children, business, modules, user }: ShellProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const commands = useMemo(() => buildCommands(business.id, modules, isSuperAdmin, (path) => router.push(path)), [business.id, modules, isSuperAdmin, router]);

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
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-surface/95 px-3 backdrop-blur-sm lg:pl-4">
        <div className="flex w-full items-center gap-2">
          <DialogRoot open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"><Menu className="size-5" /></Button>
            </DialogTrigger>
            <DialogContent className="top-0 left-0 h-dvh w-[290px] max-w-[86vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
              <DialogTitle className="sr-only">Navigation</DialogTitle>
              <div className="flex h-full flex-col pt-4">
                <div className="px-4 pb-3"><BrandMark /></div>
                <div className="border-y border-border px-4 py-2.5">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Business</p>
                  <p className="truncate text-xs font-semibold text-foreground">{business.name}</p>
                </div>
                <SidebarNav businessId={business.id} modules={modules} isSuperAdmin={isSuperAdmin} onNavigate={() => setMobileOpen(false)} />
              </div>
            </DialogContent>
          </DialogRoot>
          <Link href={`/b/${business.id}/overview`} className="hidden w-[222px] shrink-0 lg:block"><BrandMark /></Link>
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
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Search or jump to (Ctrl K)" onClick={() => setPaletteOpen(true)}><Search className="size-[18px]" /></Button>
          <ModuleFlowGuide />
          <Button variant="ghost" size="icon" aria-label="Help" title="Help" onClick={() => setHelpOpen(true)}><CircleHelp className="size-[18px]" /></Button>
          <AccountMenu user={user} businessId={business.id} />
        </div>
      </header>
      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
          <div className="border-b border-border px-3.5 py-2.5">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Business</p>
            <p className="truncate text-xs font-semibold text-foreground">{business.name}</p>
          </div>
          <SidebarNav businessId={business.id} modules={modules} isSuperAdmin={isSuperAdmin} />
        </aside>
        <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
      </div>
      {/* Mobile floating action button — a more discoverable command-palette
          trigger that's thumb-reachable on long pages. Hidden on desktop
          where the centered search bar in the header is the primary trigger
          and Cmd+K is the keyboard shortcut. The `pb-safe`-equivalent bottom
          inset keeps it clear of the iOS home indicator. */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search or jump to (opens command palette)"
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-30 grid size-12 place-items-center rounded-full border border-border bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(15_23_42/0.18)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
      >
        <Search className="size-5" />
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={commands} />
      <DialogRoot open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogTitle>Help</DialogTitle>
          <DialogDescription>The essentials for getting around Ledgerly.</DialogDescription>
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
                <li>On mobile: tap the floating search button (bottom-right) to open the palette.</li>
              </ul>
            </section>
            <p className="text-xs text-muted-foreground">Demo account: admin@demo.local</p>
          </div>
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setHelpOpen(false)}>Close</Button></div>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
