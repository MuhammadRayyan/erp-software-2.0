"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ModuleKey } from "@/core/permissions/permissions";
import { primaryNav, settingsNav, type NavItem } from "./nav-items";

function NavLink({ businessId, item, onNavigate }: { businessId: string; item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const href = `/b/${businessId}${item.path}`;
  const active = pathname === href || (item.path !== "/overview" && pathname.startsWith(`${href}/`));
  const Icon = item.icon;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex h-8.5 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-accent font-medium text-accent-foreground",
      )}
    >
      <Icon className="size-[16px] shrink-0" />
      {item.label}
    </Link>
  );
}

export function SidebarNav({ businessId, modules, onNavigate }: { businessId: string; modules: ModuleKey[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Business modules" className="flex min-h-0 flex-1 flex-col px-2.5 pb-3">
      <div className="space-y-4 overflow-y-auto py-3">
        {primaryNav.map((group, index) => {
          const items = group.items.filter((item) => !item.module || modules.includes(item.module));
          if (!items.length) return null;
          return (
            <section key={group.label ?? index}>
              {group.label && <p className="mb-1 px-2.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">{group.label}</p>}
              <div className="space-y-0.5">{items.map((item) => <NavLink key={item.path} businessId={businessId} item={item} onNavigate={onNavigate} />)}</div>
            </section>
          );
        })}
      </div>
      {modules.includes("settings") && (
        <div className="mt-auto border-t border-border pt-2">
          <NavLink businessId={businessId} item={settingsNav} onNavigate={onNavigate} />
        </div>
      )}
    </nav>
  );
}
