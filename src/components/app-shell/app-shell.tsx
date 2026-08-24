"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleHelp, ContactRound, FileInput, FolderKanban, Menu, ReceiptText, Search, Truck, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { CommandPalette, type CommandItem } from "@/components/command-palette";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModuleKey } from "@/core/permissions/permissions";
import { ThemeMenu } from "@/core/theme/theme-menu";
import { BusinessSwitcher } from "./business-switcher";
import { primaryNav, settingsNav } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";

type ShellProps = {
  children: React.ReactNode;
  business: { id: string; name: string };
  businesses: { id: string; name: string }[];
  modules: ModuleKey[];
  user: { name: string; email: string };
};

function buildCommands(businessId: string, modules: ModuleKey[], push: (path: string) => void): CommandItem[] {
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
    navigation.push({ label: settingsNav.label, hint: "Go to", icon: settingsNav.icon, keywords: "settings preferences configuration", onSelect: go(settingsNav.path) });
  }
  const actions: CommandItem[] = [];
  if (modules.includes("sales")) {
    actions.push(
      { label: "New Invoice", hint: "Create", icon: ReceiptText, keywords: "new create add sales invoice", onSelect: go("/sales/invoices/new") },
      { label: "New Customer", hint: "Create", icon: ContactRound, keywords: "new create add customer sales", onSelect: go("/customers/new") },
    );
  }
  if (modules.includes("purchases")) {
    actions.push(
      { label: "New Supplier", hint: "Create", icon: Truck, keywords: "new create add supplier vendor purchases", onSelect: go("/suppliers/new") },
      { label: "New Purchase Invoice", hint: "Create", icon: FileInput, keywords: "new create add purchase invoice bill purchases", onSelect: go("/purchases/invoices/new") },
    );
  }
  if (modules.includes("projects")) {
    actions.push({ label: "New Project", hint: "Create", icon: FolderKanban, keywords: "new create add project", onSelect: go("/projects/new") });
  }
  return [...navigation, ...actions];
}

export function AppShell({ children, business, businesses, modules, user }: ShellProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const commands = useMemo(() => buildCommands(business.id, modules, (path) => router.push(path)), [business.id, modules, router]);

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
                <div className="mx-2 border-y border-border py-1"><BusinessSwitcher current={business} businesses={businesses} /></div>
                <SidebarNav businessId={business.id} modules={modules} onNavigate={() => setMobileOpen(false)} />
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
          <Button variant="ghost" size="icon" aria-label="Help" title="Help" onClick={() => setHelpOpen(true)}><CircleHelp className="size-[18px]" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2" aria-label={`Account menu for ${user.name}`}><span className="grid size-7 place-items-center rounded-full bg-secondary text-secondary-foreground"><UserRound className="size-3.5" /></span><span className="hidden max-w-28 truncate text-[13px] sm:block">{user.name}</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel><span className="block text-foreground">{user.name}</span><span className="block font-normal">{user.email}</span></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <ThemeMenu />
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/businesses">Switch business</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/logout">Sign out</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
          <div className="m-2 border-b border-border pb-2"><BusinessSwitcher current={business} businesses={businesses} /></div>
          <SidebarNav businessId={business.id} modules={modules} />
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
