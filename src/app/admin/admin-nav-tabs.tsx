"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, Building2, Shield, UserCheck } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AdminNavTabsProps {
  currentTab?: "tenants" | "businesses" | "audit" | "engine-health";
  counts?: {
    tenants?: number;
    businesses?: number;
    audit?: number;
  };
}

export function AdminNavTabs({ currentTab, counts }: AdminNavTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolvedTab: "tenants" | "businesses" | "audit" | "engine-health" =
    currentTab ??
    (pathname.startsWith("/admin/engine-health")
      ? "engine-health"
      : searchParams.get("tab") === "businesses"
        ? "businesses"
        : searchParams.get("tab") === "audit"
          ? "audit"
          : "tenants");

  const tabs = [
    {
      id: "tenants" as const,
      href: "/admin?tab=tenants",
      label: "Account Holders (Tenants)",
      count: counts?.tenants,
      icon: UserCheck,
    },
    {
      id: "businesses" as const,
      href: "/admin?tab=businesses",
      label: "All Workspaces",
      count: counts?.businesses,
      icon: Building2,
    },
    {
      id: "audit" as const,
      href: "/admin?tab=audit",
      label: "Platform Audit Log",
      count: counts?.audit,
      icon: Shield,
    },
    {
      id: "engine-health" as const,
      href: "/admin/engine-health",
      label: "Engine Health",
      icon: Activity,
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <nav className="border-b border-border bg-surface/50" aria-label="Admin Navigation Tabs">
      <div className="mx-auto flex w-full max-w-7xl gap-6 overflow-x-auto px-4 text-sm font-medium no-scrollbar sm:px-6">
        {tabs.map((tab) => {
          const isActive = resolvedTab === tab.id;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 py-2.5 whitespace-nowrap transition-colors",
                isActive
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4",
                  tab.iconColor ?? (isActive ? "text-primary" : "text-muted-foreground"),
                )}
              />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({tab.count})
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
