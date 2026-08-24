"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RANGE_STORAGE_KEY = "ledgerly.overview.range";
const RANGE_PREFERENCE_KEY = "overview.range";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DateRange = { from: string; to: string };

/** Server-loaded snapshot of the last saved range. Decoded in the server page
 *  component from the per-account preferences store and passed in as a prop so
 *  the very first paint can restore the user's last choice without waiting on
 *  a network round-trip. */
export type ServerDateRange = DateRange;

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Quick ranges built from the current local date. Empty strings mean "no bound". */
const presets: { label: string; range: () => DateRange }[] = [
  {
    label: "This month",
    range: () => {
      const now = new Date();
      return { from: toDateString(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    },
  },
  {
    label: "Last month",
    range: () => {
      const now = new Date();
      return { from: toDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: toDateString(new Date(now.getFullYear(), now.getMonth(), 0)) };
    },
  },
  {
    label: "This quarter",
    range: () => {
      const now = new Date();
      const startMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: toDateString(new Date(now.getFullYear(), startMonth, 1)), to: toDateString(new Date(now.getFullYear(), startMonth + 3, 0)) };
    },
  },
  {
    label: "This year",
    range: () => {
      const now = new Date();
      return { from: toDateString(new Date(now.getFullYear(), 0, 1)), to: toDateString(new Date(now.getFullYear(), 11, 31)) };
    },
  },
  { label: "All time", range: () => ({ from: "", to: "" }) },
];

function readStoredRange(): DateRange | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const from = typeof record.from === "string" && (record.from === "" || DATE_PATTERN.test(record.from)) ? record.from : "";
    const to = typeof record.to === "string" && (record.to === "" || DATE_PATTERN.test(record.to)) ? record.to : "";
    if (!from && !to) return null;
    return { from, to };
  } catch {
    return null;
  }
}

function persistRange(range: DateRange) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(range));
  } catch {
    // Best-effort persistence (private mode / quota exceeded).
  }
}

function applyRange(router: ReturnType<typeof useRouter>, pathname: string, range: DateRange) {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const query = params.toString();
  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
}

/**
 * Date-range control for the overview page. The URL (`?from=&to=`) is the
 * source of truth — inputs are controlled by the server-provided range and
 * every change writes search params (server-side filtering of period KPIs).
 *
 * Persistence uses two layers:
 *  - localStorage (`ledgerly.overview.range`) for fast first-paint hydration
 *    on a returning device (no network wait).
 *  - The per-account server preferences store (`overview.range` key) so the
 *    last choice syncs across devices and survives a browser-data clear.
 *
 * On a fresh navigation (no `?from`/`?to` in the URL) the component restores
 * the saved range — preferring the server snapshot (already-correct for the
 * signed-in user on any device) and falling back to the localStorage mirror
 * for offline-first hydration.
 */
export function OverviewControls({
  from,
  to,
  serverRange,
  businessId,
}: {
  from?: string;
  to?: string;
  serverRange?: ServerDateRange;
  businessId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const restoreAttempted = useRef(false);
  const fromValue = from ?? "";
  const toValue = to ?? "";

  // Restore the persisted range when the URL carries none (fresh navigation).
  // Server snapshot wins because it's already user+business scoped; the
  // localStorage mirror is the fallback for the very first mount on a brand
  // new device where the server snapshot hasn't been written yet.
  useEffect(() => {
    if (restoreAttempted.current || from || to) return;
    restoreAttempted.current = true;
    const stored = serverRange ?? readStoredRange();
    if (stored) applyRange(router, pathname, stored);
  }, [from, to, pathname, router, serverRange]);

  // Push the next range to both localStorage (synchronous fast cache) and the
  // server preferences endpoint (debounced, fire-and-forget — the URL update
  // already happened and is the authoritative state).
  const lastServerPushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushToServer = (range: DateRange) => {
    if (lastServerPushRef.current) clearTimeout(lastServerPushRef.current);
    lastServerPushRef.current = setTimeout(() => {
      // Best-effort: silent fail. The URL is already authoritative; the
      // server snapshot only matters for the next fresh navigation.
      try {
        void fetch(`/api/businesses/${businessId}/preferences`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: { [RANGE_PREFERENCE_KEY]: JSON.stringify(range) } }),
        }).catch(() => {
          // Swallow network errors — best-effort sync.
        });
      } catch {
        // Swallow.
      }
    }, 600);
  };

  const apply = (next: DateRange) => {
    persistRange(next);
    pushToServer(next);
    applyRange(router, pathname, next);
  };

  const handleDateInput = (bound: "from" | "to") => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value && !DATE_PATTERN.test(value)) return;
    apply(bound === "from" ? { from: value, to: toValue } : { from: fromValue, to: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Period</span>
      <Input type="date" value={fromValue} onChange={handleDateInput("from")} aria-label="Period from" className="w-38" />
      <Input type="date" value={toValue} onChange={handleDateInput("to")} aria-label="Period to" className="w-38" />
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <div className="flex flex-wrap items-center gap-1">
        {presets.map((preset) => {
          const presetRange = preset.range();
          const isActive = presetRange.from === fromValue && presetRange.to === toValue;
          return (
            <Button key={preset.label} variant={isActive ? "secondary" : "ghost"} size="sm" className={isActive ? "" : "text-muted-foreground"} onClick={() => apply(presetRange)}>
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
