"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewChartsPanel, type OverviewChartsPayload } from "./overview-charts-panel";

type OverviewTabsLayoutProps = {
  businessId: string;
  initialView?: "financial" | "charts" | "operations";
  financialView: React.ReactNode | null;
  initialChartData?: OverviewChartsPayload | null;
};

function OverviewTabLoading({ label }: { label: string }) {
  return (
    <div className="data-panel animate-pulse p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function OverviewTabsLayout({
  businessId,
  initialView = "financial",
  financialView,
  initialChartData = null,
}: OverviewTabsLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"financial" | "charts">(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "charts" || fromUrl === "operations") return "charts";
    return initialView === "charts" || initialView === "operations" ? "charts" : "financial";
  });

  const [chartsData, setChartsData] = useState<OverviewChartsPayload | null>(initialChartData);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [chartsError, setChartsError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const loadCharts = useCallback(() => {
    if (chartsData || inFlightRef.current) return;
    setChartsLoading(true);
    setChartsError(null);
    const req = fetch(`/api/businesses/${businessId}/overview-charts`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load overview charts.");
        const json = (await res.json()) as OverviewChartsPayload;
        setChartsData(json);
      })
      .catch((err) => {
        setChartsError(err instanceof Error ? err.message : "Failed to load overview charts.");
      })
      .finally(() => {
        inFlightRef.current = null;
        setChartsLoading(false);
      });
    inFlightRef.current = req;
  }, [businessId, chartsData]);

  // Idle-prefetch Chart Views JSON shortly after Financial View hydrates so clicking Chart Views is instant.
  useEffect(() => {
    if (chartsData) return;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const idleId = win.requestIdleCallback(() => loadCharts(), { timeout: 600 });
      return () => win.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(() => loadCharts(), 120);
    return () => window.clearTimeout(timer);
  }, [chartsData, loadCharts]);

  useEffect(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "charts" || fromUrl === "operations") {
      setActiveTab("charts");
    } else {
      setActiveTab("financial");
    }
  }, [searchParams]);

  function switchTab(tab: "financial" | "charts") {
    const params = new URLSearchParams(window.location.search);
    if (tab === "financial") {
      params.delete("view");
    } else {
      params.set("view", "charts");
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const nextUrl = `${pathname}${query}`;

    if (tab === "charts") {
      loadCharts();
      setActiveTab("charts");
      window.history.replaceState(window.history.state, "", nextUrl);
      return;
    }

    setActiveTab("financial");
    if (financialView !== null) {
      window.history.replaceState(window.history.state, "", nextUrl);
    } else {
      // Only needed when initial page load was ?view=charts so SSR did not render financialView.
      router.replace(nextUrl, { scroll: false });
    }
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(next) => switchTab(next === "charts" ? "charts" : "financial")}
      className="space-y-5"
    >
      {/* View Switcher Segmented Control */}
      <div className="flex flex-col justify-between gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-center">
        <TabsList aria-label="Overview views">
          <TabsTrigger id="tab-financial" value="financial" className="gap-2 px-3.5">
            <TrendingUp className="size-3.5 text-primary" />
            <span>Financial Insight View</span>
          </TabsTrigger>
          <TabsTrigger
            id="tab-charts"
            value="charts"
            onPointerEnter={loadCharts}
            onFocus={loadCharts}
            className="gap-2 px-3.5"
          >
            <BarChart3 className="size-3.5 text-primary" />
            <span>Chart Views</span>
          </TabsTrigger>
        </TabsList>

        <div className="text-xs text-muted-foreground">
          {activeTab === "financial" ? (
            <span>Showing KPI metric cards, balance sheet, profit &amp; loss, and recent transactions</span>
          ) : (
            <span>Showing visual revenue vs expenses trend, receivables aging, and 30-day runway projection</span>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      <TabsContent value="financial" className="mt-0">
        {financialView ?? <OverviewTabLoading label="Loading financial overview…" />}
      </TabsContent>
      <TabsContent value="charts" className="mt-0">
        <OverviewChartsPanel
          businessId={businessId}
          data={chartsData}
          loading={chartsLoading}
          error={chartsError}
          onRetry={loadCharts}
        />
      </TabsContent>
    </Tabs>
  );
}
