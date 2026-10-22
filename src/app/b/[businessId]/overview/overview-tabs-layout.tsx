"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

type OverviewTabsLayoutProps = {
  initialView?: "financial" | "charts" | "operations";
  financialView: React.ReactNode;
  chartViews: React.ReactNode;
};

export function OverviewTabsLayout({
  initialView = "financial",
  financialView,
  chartViews,
}: OverviewTabsLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"financial" | "charts">(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "charts" || fromUrl === "operations") return "charts";
    return initialView === "charts" || initialView === "operations" ? "charts" : "financial";
  });

  useEffect(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "charts" || fromUrl === "operations") {
      setActiveTab("charts");
    } else {
      setActiveTab("financial");
    }
  }, [searchParams]);

  function switchTab(tab: "financial" | "charts") {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "financial") {
      params.delete("view");
    } else {
      params.set("view", "charts");
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
            <span>Financial Insight View</span>
          </button>

          <button
            id="tab-charts"
            type="button"
            onClick={() => switchTab("charts")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "charts"
                ? "bg-surface text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            )}
            aria-selected={activeTab === "charts"}
            aria-controls="overview-tabpanel"
            role="tab"
          >
            <BarChart3 className="size-3.5 text-primary" />
            <span>Chart Views</span>
          </button>
        </div>

        <div className="text-xs text-muted-foreground">
          {activeTab === "financial" ? (
            <span>Showing KPI metric cards, balance sheet, profit & loss, and recent transactions</span>
          ) : (
            <span>Showing visual revenue vs expenses trend, receivables aging, and 30-day runway projection</span>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      <div
        role="tabpanel"
        id="overview-tabpanel"
        aria-labelledby={activeTab === "financial" ? "tab-financial" : "tab-charts"}
      >
        {activeTab === "financial" ? financialView : chartViews}
      </div>
    </div>
  );
}
