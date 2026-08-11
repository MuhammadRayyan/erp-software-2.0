"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleHelp, Menu, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { SidebarNav } from "./sidebar-nav";

type ShellProps = {
  children: React.ReactNode;
  business: { id: string; name: string };
  businesses: { id: string; name: string }[];
  modules: ModuleKey[];
  user: { name: string; email: string };
};

export function AppShell({ children, business, businesses, modules, user }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
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
            onClick={() => toast.info("Command search is planned for a later phase.")}
            className="mx-auto hidden h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-left text-[13px] text-muted-foreground hover:border-border-strong lg:flex"
          >
            <Search className="size-3.5" /> Search or jump to… <kbd className="ml-auto text-[11px]">Ctrl K</kbd>
          </button>
          <Button variant="ghost" size="icon" aria-label="Help unavailable" title="Help center is planned for a later phase" disabled><CircleHelp className="size-[18px]" /></Button>
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
    </div>
  );
}
