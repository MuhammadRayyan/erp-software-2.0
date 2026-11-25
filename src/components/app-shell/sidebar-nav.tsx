"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ModuleKey } from "@/core/permissions/permissions";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { primaryNav, settingsNav, type NavItem } from "./nav-items";
import { isNavPathVisible } from "./nav-customization";

const COLLAPSED_GROUPS_STORAGE_KEY = "uaemanager.navGroupsCollapsed";

function readCollapsedGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // Ignore corrupt local storage entries.
  }
  return {};
}

function NavLink({
  businessId,
  item,
  collapsed,
  onNavigate,
}: {
  businessId: string;
  item: NavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const href = `/b/${businessId}${item.path}`;
  const active =
    pathname === href || (item.path !== "/overview" && pathname.startsWith(`${href}/`));
  const Icon = item.icon;

  const linkNode = (
    <Link
      href={href}
      prefetch={true}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex h-8.5 items-center rounded-[6px] text-[13px] text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "mx-auto size-9 justify-center px-0" : "gap-2.5 px-2.5",
        active && "bg-accent font-medium text-accent-foreground",
      )}
    >
      <Icon className="size-[16px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkNode}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return linkNode;
}

export function SidebarNav({
  businessId,
  modules,
  hiddenNavPaths = [],
  collapsed = false,
  onNavigate,
}: {
  businessId: string;
  modules: ModuleKey[];
  hiddenNavPaths?: readonly string[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedGroups(readCollapsedGroups());
  }, []);

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage write failure.
      }
      return next;
    });
  }, []);

  return (
    <nav
      aria-label="Business modules"
      className={cn(
        "flex min-h-0 flex-1 flex-col pb-3",
        collapsed ? "px-1.5" : "px-2.5",
      )}
    >
      <div className={cn("overflow-y-auto py-3 no-scrollbar", collapsed ? "space-y-2" : "space-y-3")}>
        {primaryNav.map((group, index) => {
          const items = group.items.filter((item) => {
            if (!isNavPathVisible(item.path, hiddenNavPaths)) return false;
            if (item.modules) return item.modules.some((m) => modules.includes(m));
            if (item.module) return modules.includes(item.module);
            return true;
          });
          if (!items.length) return null;

          const groupKey = group.label ?? `group-${index}`;
          const showGroupHeader = Boolean(group.label && !(items.length === 1 && group.label === items[0].label));
          const hasActiveItem = items.some((item) => {
            const href = `/b/${businessId}${item.path}`;
            return pathname === href || (item.path !== "/overview" && pathname.startsWith(`${href}/`));
          });
          const isGroupCollapsed =
            !collapsed && !hasActiveItem && Boolean(showGroupHeader && group.label && collapsedGroups[group.label]);

          return (
            <section key={groupKey}>
              {showGroupHeader &&
                (collapsed ? (
                  <div className="my-1.5 border-t border-border/70" aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label!)}
                    aria-expanded={!isGroupCollapsed}
                    className="mb-1 flex w-full items-center justify-between rounded px-2.5 py-0.5 text-left text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>{group.label}</span>
                    {isGroupCollapsed ? (
                      <ChevronRight className="size-3 opacity-70" />
                    ) : (
                      <ChevronDown className="size-3 opacity-70" />
                    )}
                  </button>
                ))}
              {!isGroupCollapsed && (
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.path}
                      businessId={businessId}
                      item={item}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {modules.includes("settings") && (
        <div className="mt-auto border-t border-border pt-2">
          <NavLink
            businessId={businessId}
            item={settingsNav}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </nav>
  );
}
