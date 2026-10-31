"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Clock, Info, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type AuditLogRow = {
  id: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  userId: string | null;
  businessId: string | null;
  createdAt: string;
};

export function AuditLogTable({ logs }: { logs: AuditLogRow[] }) {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warn" | "error">("all");

  const counts = useMemo(() => {
    return {
      all: logs.length,
      info: logs.filter((l) => l.level === "info").length,
      warn: logs.filter((l) => l.level === "warn").length,
      error: logs.filter((l) => l.level === "error").length,
    };
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (levelFilter !== "all" && l.level !== levelFilter) return false;
      if (!q) return true;
      return (
        l.message.toLowerCase().includes(q) ||
        (l.userId && l.userId.toLowerCase().includes(q)) ||
        (l.businessId && l.businessId.toLowerCase().includes(q))
      );
    });
  }, [logs, search, levelFilter]);

  function handleResetFilters() {
    setSearch("");
    setLevelFilter("all");
  }

  const isFiltered = Boolean(search.trim() || levelFilter !== "all");

  return (
    <div className="space-y-4">
      {/* Controls & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised p-1 text-sm overflow-x-auto">
          <button
            type="button"
            onClick={() => setLevelFilter("all")}
            className={`rounded-md px-3.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              levelFilter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Events ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setLevelFilter("info")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              levelFilter === "info"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Info className="size-3.5" /> Info ({counts.info})
          </button>
          <button
            type="button"
            onClick={() => setLevelFilter("warn")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              levelFilter === "warn"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="size-3.5" /> Warnings ({counts.warn})
          </button>
          <button
            type="button"
            onClick={() => setLevelFilter("error")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              levelFilter === "error"
                ? "bg-red-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertCircle className="size-3.5" /> Errors ({counts.error})
          </button>
        </div>

        {/* Search Input with Clear Button */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, user ID, workspace..."
            className="pl-9 pr-8 h-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing {filtered.length} of {logs.length} recorded platform events
        </span>
        {isFiltered && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-primary hover:underline font-medium"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted-foreground">
              <tr>
                <th className="px-4 py-3.5 font-semibold w-48">Timestamp</th>
                <th className="px-4 py-3.5 font-semibold w-28">Severity</th>
                <th className="px-4 py-3.5 font-semibold">Event Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-sm font-sans text-muted-foreground">
                    <p>
                      {isFiltered
                        ? "No log events matching the selected filter or search query."
                        : "No log events recorded yet."}
                    </p>
                    {isFiltered && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleResetFilters}
                        className="mt-3 text-xs"
                      >
                        Clear filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const isWarn = log.level === "warn" || log.level === "error";
                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors hover:bg-surface-muted/30 ${
                        isWarn ? "bg-amber-500/[0.04]" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3.5 text-muted-foreground" />
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.level === "info" && (
                          <span className="inline-flex items-center gap-1.5 rounded bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                            <Info className="size-3.5" /> INFO
                          </span>
                        )}
                        {log.level === "warn" && (
                          <span className="inline-flex items-center gap-1.5 rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="size-3.5" /> WARN
                          </span>
                        )}
                        {log.level === "error" && (
                          <span className="inline-flex items-center gap-1.5 rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                            <AlertCircle className="size-3.5" /> ERROR
                          </span>
                        )}
                        {log.level === "debug" && (
                          <span className="inline-flex items-center gap-1.5 rounded bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                            DEBUG
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-sans text-sm text-foreground">
                        {log.message}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
