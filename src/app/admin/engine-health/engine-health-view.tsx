"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/core/format";
import { getEngineDiagnosticsAction, type EngineDiagnostics } from "./actions";
import { toast } from "sonner";

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

export function EngineHealthView({ initialData }: { initialData: EngineDiagnostics }) {
  const [data, setData] = useState<EngineDiagnostics>(initialData);
  const [isPending, startTransition] = useTransition();
  const [lastPingMs, setLastPingMs] = useState<number | null>(data.database.latencyMs);

  function handleRefresh() {
    startTransition(async () => {
      try {
        const fresh = await getEngineDiagnosticsAction();
        setData(fresh);
        setLastPingMs(fresh.database.latencyMs);
        toast.success(`Engine metrics refreshed. DB latency: ${fresh.database.latencyMs}ms`);
      } catch {
        toast.error("Failed to refresh diagnostics.");
      }
    });
  }

  const heapPct = Math.min(100, Math.round((data.memory.heapUsedMb / Math.max(1, data.memory.heapTotalMb)) * 100));

  return (
    <div className="space-y-6">
      {/* Navigation & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
            <Link href="/admin" className="hover:text-foreground flex items-center gap-1 transition-colors">
              <ArrowLeft className="size-3.5" /> Platform Admin
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Engine Health</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Engine Health</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Operational
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time telemetry, SQLite WAL storage metrics, memory allocation, and runtime host status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isPending}
            className="gap-2 text-sm"
          >
            <RefreshCw className={`size-4 ${isPending ? "animate-spin text-primary" : ""}`} />
            {isPending ? "Testing..." : "Ping & Refresh"}
          </Button>
          <Button asChild variant="secondary" size="sm" className="gap-1.5 text-sm">
            <Link href="/api/health" target="_blank" rel="noreferrer">
              Raw JSON API <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {/* Status */}
        <div className="rounded-xl border border-border bg-surface-raised p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Engine Status</span>
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400 capitalize">
            {data.status === "ok" ? "Operational" : data.status}
          </div>
          <span className="text-xs text-muted-foreground">All systems passing</span>
        </div>

        {/* DB Latency */}
        <div className="rounded-xl border border-border bg-surface-raised p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">DB Latency</span>
            <Zap className="size-5 text-amber-500" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-foreground">
            {lastPingMs !== null ? `${lastPingMs} ms` : "< 1 ms"}
          </div>
          <span className="text-xs text-muted-foreground">SQLite ping roundtrip</span>
        </div>

        {/* Process Uptime */}
        <div className="rounded-xl border border-border bg-surface-raised p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Process Uptime</span>
            <Clock className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-foreground">
            {formatUptime(data.uptimeSeconds)}
          </div>
          <span className="text-xs text-muted-foreground">Continuous running</span>
        </div>

        {/* Memory Heap */}
        <div className="rounded-xl border border-border bg-surface-raised p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Heap Used</span>
            <Cpu className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-foreground">
            {data.memory.heapUsedMb} MB
          </div>
          <span className="text-xs text-muted-foreground">of {data.memory.heapTotalMb} MB total</span>
        </div>

        {/* RSS Memory */}
        <div className="rounded-xl border border-border bg-surface-raised p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">RSS Memory</span>
            <Server className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-foreground">
            {data.memory.rssMb} MB
          </div>
          <span className="text-xs text-muted-foreground">Resident memory set</span>
        </div>

        {/* Journal Mode */}
        <div className="rounded-xl border border-border bg-surface-raised p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">SQLite Engine</span>
            <Database className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold uppercase text-foreground">
            {data.database.journalMode}
          </div>
          <span className="text-xs text-muted-foreground">Write-Ahead Logging</span>
        </div>
      </div>

      {/* Detailed Diagnostic Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SQLite Database & Storage Telemetry */}
        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <Database className="size-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">System Database & WAL Engine</h2>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {data.database.tableCount} tables active
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Main Database File</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">
                {formatBytes(data.database.systemDbSizeBytes)}
              </p>
              <p className="text-xs text-muted-foreground">ledgerly-system.db</p>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">WAL Journal File</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">
                {formatBytes(data.database.systemWalSizeBytes)}
              </p>
              <p className="text-xs text-muted-foreground">Write-ahead log buffer</p>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">SHM Shared Index</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">
                {formatBytes(data.database.systemShmSizeBytes)}
              </p>
              <p className="text-xs text-muted-foreground">Shared memory index</p>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Combined System Storage</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">
                {formatBytes(data.database.totalSizeBytes)}
              </p>
              <p className="text-xs text-muted-foreground">Total system disk usage</p>
            </div>
          </div>

          {/* PRAGMA configuration table */}
          <div className="rounded-lg border border-border bg-surface/40 p-4 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              SQLite PRAGMA Configurations
            </h3>
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <div className="flex justify-between pr-4 border-r border-border">
                <span className="text-muted-foreground">Journal Mode:</span>
                <span className="font-mono font-medium uppercase text-foreground">{data.database.journalMode}</span>
              </div>
              <div className="flex justify-between pl-4">
                <span className="text-muted-foreground">Page Size:</span>
                <span className="font-mono font-medium text-foreground">{data.database.pageSize} bytes</span>
              </div>
              <div className="flex justify-between pr-4 border-r border-border">
                <span className="text-muted-foreground">Busy Timeout:</span>
                <span className="font-mono font-medium text-foreground">{data.database.busyTimeout} ms</span>
              </div>
              <div className="flex justify-between pl-4">
                <span className="text-muted-foreground">Foreign Keys:</span>
                <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  {data.database.foreignKeys ? "Enforced (ON)" : "OFF"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Process, Runtime & Memory Allocation */}
        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <Server className="size-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Runtime Process & Host Memory</h2>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              PID: {data.processInfo.pid}
            </span>
          </div>

          {/* Memory Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground">Heap Utilization ({heapPct}%)</span>
              <span className="font-mono text-muted-foreground">
                {data.memory.heapUsedMb} MB / {data.memory.heapTotalMb} MB
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-surface-muted overflow-hidden border border-border">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${heapPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Host Free Memory</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">
                {data.processInfo.freeSystemMemoryMb} MB
              </p>
              <p className="text-xs text-muted-foreground">of {data.processInfo.totalSystemMemoryMb} MB Host RAM</p>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Node & App Version</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">
                {data.processInfo.nodeVersion}
              </p>
              <p className="text-xs text-muted-foreground">Ledgerly v{data.processInfo.version}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Host Architecture</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">
                {data.processInfo.platform}-{data.processInfo.arch}
              </p>
              <p className="text-xs text-muted-foreground">{data.processInfo.cpuCores} CPU Cores active</p>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Environment</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground uppercase">
                {data.processInfo.environment}
              </p>
              <p className="text-xs text-muted-foreground">Server execution mode</p>
            </div>
          </div>

          {/* Tenancy Capacity Footer */}
          <div className="rounded-lg border border-border bg-surface/40 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Platform Footprint:</span>
              <span className="font-medium text-foreground">
                {data.tenancy.totalTenants} Account Holders • {data.tenancy.totalBusinesses} Workspaces • {data.tenancy.totalUsers} Platform Users
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
