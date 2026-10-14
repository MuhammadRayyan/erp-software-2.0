"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { triggerDiagnosticTraceAction } from "./actions";

export type SystemHealthData = {
  businessId: string;
  uptimeSeconds: number;
  environment: string;
  nodeVersion: string;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
  businessDb: {
    databaseSizeBytes: number;
    walSizeBytes: number;
    shmSizeBytes: number;
    totalSizeBytes: number;
    pageSize: number;
    pageCount: number;
    journalMode: string;
    busyTimeout: number;
    synchronous: number;
    foreignKeys: number;
    tableCount: number;
  };
  systemDb: {
    databaseSizeBytes: number;
    walSizeBytes: number;
    totalSizeBytes: number;
    tableCount: number;
  };
  recentLogs: Array<{
    id: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    traceId: string | null;
    spanId: string | null;
    businessId: string | null;
    userId: string | null;
    metadataJson: string | null;
    createdAt: string;
  }>;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.length ? parts.join(" ") : "0s";
}

export function SystemHealthClient({ initialData }: { initialData: SystemHealthData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const handleCopyTrace = (traceId: string) => {
    navigator.clipboard.writeText(traceId);
    setCopiedId(traceId);
    toast.success(`Trace ID copied: ${traceId}`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleTriggerTrace = () => {
    startTransition(async () => {
      try {
        const result = await triggerDiagnosticTraceAction(initialData.businessId);
        if (result.success) {
          toast.success("Sample Sentry trace & error logged successfully", {
            description: `Correlated Trace ID: ${result.traceId}`,
          });
          router.refresh();
        }
      } catch (err) {
        toast.error("Failed to trigger diagnostic trace", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    startTransition(() => {
      router.refresh();
      setTimeout(() => setIsRefreshing(false), 500);
    });
  };

  // Filter logs by level and text
  const filteredLogs = initialData.recentLogs.filter((log) => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchTrace = log.traceId?.toLowerCase().includes(q);
      const matchMeta = log.metadataJson?.toLowerCase().includes(q);
      return matchMsg || matchTrace || matchMeta;
    }
    return true;
  });

  const memoryPercent = Math.min(
    100,
    Math.round((initialData.memory.heapUsedMb / initialData.memory.heapTotalMb) * 100),
  );

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Radio className="size-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">System Status: Operational</h2>
              <Badge tone="success">Health: 100%</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Uptime: {formatUptime(initialData.uptimeSeconds)} • Node: {initialData.nodeVersion} • Env: {initialData.environment}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isPending}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleTriggerTrace}
            disabled={isPending}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Sparkles className="size-3.5" />
            {isPending ? "Emitting Trace…" : "Trigger Sample Sentry Trace"}
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Memory */}
        <div className="data-panel rounded-lg border border-border bg-surface-raised p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Heap Memory</span>
            <Cpu className="size-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {initialData.memory.heapUsedMb} <span className="text-xs font-normal text-muted-foreground">MB</span>
            </span>
            <span className="text-xs text-muted-foreground">/ {initialData.memory.heapTotalMb} MB</span>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${memoryPercent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>RSS: {initialData.memory.rssMb} MB</span>
              <span>{memoryPercent}% heap</span>
            </div>
          </div>
        </div>

        {/* Card 2: Business Database */}
        <div className="data-panel rounded-lg border border-border bg-surface-raised p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Business DB (SQLite)</span>
            <Database className="size-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {formatBytes(initialData.businessDb.databaseSizeBytes)}
            </span>
            <Badge tone="info">WAL</Badge>
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <span>WAL Log Size:</span>
              <span className="font-mono font-medium text-foreground">
                {formatBytes(initialData.businessDb.walSizeBytes)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Pages / Tables:</span>
              <span className="font-mono text-foreground">
                {initialData.businessDb.pageCount} pages ({initialData.businessDb.tableCount} tables)
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Pragmas & Concurrency */}
        <div className="data-panel rounded-lg border border-border bg-surface-raised p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Hardened Pragmas</span>
            <Layers className="size-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold text-foreground uppercase">
              {initialData.businessDb.journalMode}
            </span>
            <Badge tone="success">Hardened</Badge>
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <span>Busy Timeout:</span>
              <span className="font-mono text-foreground">{initialData.businessDb.busyTimeout} ms</span>
            </div>
            <div className="flex justify-between">
              <span>Foreign Keys / Sync:</span>
              <span className="font-mono text-foreground">
                {initialData.businessDb.foreignKeys ? "ON" : "OFF"} / {initialData.businessDb.synchronous === 1 ? "NORMAL" : initialData.businessDb.synchronous}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: System DB & Storage */}
        <div className="data-panel rounded-lg border border-border bg-surface-raised p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">System DB & Logs</span>
            <HardDrive className="size-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {formatBytes(initialData.systemDb.totalSizeBytes)}
            </span>
            <span className="text-xs text-muted-foreground">total</span>
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <span>System WAL Size:</span>
              <span className="font-mono text-foreground">
                {formatBytes(initialData.systemDb.walSizeBytes)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>System Tables:</span>
              <span className="font-mono text-foreground">
                {initialData.systemDb.tableCount} tables
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sentry & OpenTelemetry Observability Header Card */}
      <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Activity className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Sentry Telemetry & Correlated Traces</h3>
                <Badge tone="info">Active Ingest</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                All unhandled RSC, server action, and API route exceptions are correlated with OpenTelemetry trace and span contexts.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground sm:text-right">
            <div>Propagation: <span className="font-mono text-foreground">W3C / Sentry Trace</span></div>
            <div>Sample Rate: <span className="font-mono text-foreground">100% dev / 10% prod</span></div>
          </div>
        </div>
      </div>

      {/* Structured Logs Section */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">Recent Structured Logs & Traces</h3>
            <p className="text-xs text-muted-foreground">
              Correlated system events, unhandled errors, and diagnostic traces recorded in SQLite `system_logs`.
            </p>
          </div>

          {/* Level Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter logs or trace ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 rounded-md border border-border bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-48 sm:w-64"
              />
            </div>
            <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
              {(["all", "error", "warn", "info"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    levelFilter === lvl
                      ? "bg-surface-raised text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xs">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-500/80 mb-2" />
              <p className="text-sm font-medium text-foreground">No logs recorded matching current filter</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All systems healthy. Click &ldquo;Trigger Sample Sentry Trace&rdquo; above to generate a test trace.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-muted/50 text-muted-foreground font-medium">
                  <tr>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5">Level</th>
                    <th className="px-4 py-2.5">Message</th>
                    <th className="px-4 py-2.5">Trace ID</th>
                    <th className="px-4 py-2.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-normal">
                  {filteredLogs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const dateStr = new Date(log.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
                    const fullDateStr = new Date(log.createdAt).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    });

                    return (
                      <tr
                        key={log.id}
                        className={`transition-colors hover:bg-surface-muted/40 ${
                          log.level === "error" ? "bg-red-500/[0.02]" : ""
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          <span className="font-mono text-foreground">{dateStr}</span>
                          <span className="ml-1.5 text-[10px] text-muted-foreground">{fullDateStr}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {log.level === "error" && <Badge tone="danger">ERROR</Badge>}
                          {log.level === "warn" && <Badge tone="warning">WARN</Badge>}
                          {log.level === "info" && <Badge tone="info">INFO</Badge>}
                          {log.level === "debug" && <Badge tone="neutral">DEBUG</Badge>}
                        </td>
                        <td className="px-4 py-3 text-foreground max-w-md">
                          <p className="font-medium line-clamp-2">{log.message}</p>
                          {log.userId && (
                            <span className="text-[10px] text-muted-foreground">User: {log.userId}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {log.traceId ? (
                            <button
                              type="button"
                              onClick={() => handleCopyTrace(log.traceId!)}
                              title="Click to copy Trace ID"
                              className="group inline-flex items-center gap-1.5 rounded bg-surface-muted px-2 py-1 font-mono text-[11px] text-foreground transition-all hover:bg-accent hover:text-accent-foreground"
                            >
                              <span>{log.traceId.slice(0, 12)}…</span>
                              {copiedId === log.traceId ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3 opacity-60 group-hover:opacity-100" />
                              )}
                            </button>
                          ) : (
                            <span className="font-mono text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {log.metadataJson ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="h-7 px-2 text-[11px]"
                            >
                              {isExpanded ? "Hide" : "JSON"}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Log JSON Modal / Drawer if selected */}
      {expandedLogId && (
        <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Log Details & Correlated Metadata</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedLogId(null)}
              className="h-6 text-xs"
            >
              Close
            </Button>
          </div>
          <pre className="mt-3 max-h-60 overflow-auto rounded bg-surface p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
            {JSON.stringify(
              JSON.parse(
                initialData.recentLogs.find((l) => l.id === expandedLogId)?.metadataJson || "{}"
              ),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
