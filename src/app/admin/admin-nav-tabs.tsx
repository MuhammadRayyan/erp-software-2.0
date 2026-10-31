import Link from "next/link";
import { Activity, Building2, Shield, UserCheck } from "lucide-react";

export interface AdminNavTabsProps {
  currentTab: "tenants" | "businesses" | "audit" | "engine-health";
  counts?: {
    tenants?: number;
    businesses?: number;
    audit?: number;
  };
}

export function AdminNavTabs({ currentTab, counts }: AdminNavTabsProps) {
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
    <nav className="border-b border-border" aria-label="Admin Navigation Tabs">
      <div className="flex gap-6 text-sm font-medium overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`pb-3 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? "border-b-2 border-primary text-foreground font-semibold"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                className={`size-4 ${
                  tab.iconColor ?? (isActive ? "text-primary" : "text-muted-foreground")
                }`}
              />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className="text-xs text-muted-foreground font-normal">
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
