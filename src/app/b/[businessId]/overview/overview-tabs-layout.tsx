"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

type OverviewTabsLayoutProps = {
  initialView?: "financial" | "operations";
  financialView: React.ReactNode;
  operationsView: React.ReactNode;
};

export function OverviewTabsLayout({
  initialView = "financial",
  financialView,
  operationsView,
}: OverviewTabsLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"financial" | "operations">(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "operations" || fromUrl === "financial") return fromUrl;
    return initialView;
  });

  useEffect(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "operations" || fromUrl === "financial") {
      setActiveTab(fromUrl);
    } else {
      setActiveTab(initialView);
    }
  }, [searchParams, initialView]);

  function switchTab(tab: "financial" | "operations") {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "financial") {
      params.delete("view");
    } else {
      params.set("view", tab);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    router.replace(`${pathname}${query}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      {/* View Switcher Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div
          role="tablist"
          aria-label="Overview views"
          className="inline-flex rounded-lg border border-border bg-surface-muted/50 p-1 shadow-2xs"
        >
          <button
            id="tab-financial"
            type="button"
            onClick={() => switchTab("financial")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "financial"
                ? "bg-surface text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            )}
            aria-selected={activeTab === "financial"}
            aria-controls="overview-tabpanel"
            role="tab"
          >
            <TrendingUp className="size-3.5 text-primary" />
            <span>Financial Insights View</span>
          </button>

          <button
            id="tab-operations"
            type="button"
            onClick={() => switchTab("operations")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "operations"
                ? "bg-surface text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            )}
            aria-selected={activeTab === "operations"}
            aria-controls="overview-tabpanel"
            role="tab"
          >
            <Layers className="size-3.5 text-primary" />
            <span>Operations Matrix View</span>
          </button>
        </div>

        <div className="text-xs text-muted-foreground">
          {activeTab === "financial" ? (
            <span>Showing KPI metrics, cash runway, trends, and recent transactions</span>
          ) : (
            <span>Showing active register matrix across all core business modules</span>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      <div
        role="tabpanel"
        id="overview-tabpanel"
        aria-labelledby={activeTab === "financial" ? "tab-financial" : "tab-operations"}
      >
        {activeTab === "financial" ? financialView : operationsView}
      </div>
    </div>
  );
}
