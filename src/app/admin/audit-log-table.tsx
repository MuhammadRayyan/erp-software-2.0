"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Info, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.message.toLowerCase().includes(q) ||
        (l.userId && l.userId.toLowerCase().includes(q)) ||
        (l.businessId && l.businessId.toLowerCase().includes(q))
    );
  }, [logs, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Showing latest platform administrative activities and security events.
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit trail..."
            className="pl-9 text-xs"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-surface-muted/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Timestamp</th>
                <th className="px-4 py-3.5 font-semibold">Severity</th>
                <th className="px-4 py-3.5 font-semibold">Event Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-sm font-sans text-muted-foreground">
                    No log events recorded yet.
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
                          <Clock className="size-3 text-muted-foreground" />
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.level === "info" && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                            <Info className="size-2.5" /> INFO
                          </span>
                        )}
                        {log.level === "warn" && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="size-2.5" /> WARN
                          </span>
                        )}
                        {log.level === "error" && (
                          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                            <AlertTriangle className="size-2.5" /> ERROR
                          </span>
                        )}
                        {log.level === "debug" && (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            DEBUG
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-sans text-xs text-foreground">
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
