"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Preset date range. The `from`/`to` values are ISO date strings
 * (`YYYY-MM-DD`) computed at click time, so the preset stays correct
 * even if the user opens the page on a different day.
 */
export type DatePreset = {
  /** Stable key for React list rendering. */
  id: string;
  /** Visible label rendered in the toolbar. */
  label: string;
  /** Returns the inclusive `from`/`to` ISO date strings for "now". */
  range: () => { from?: string; to?: string };
};

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function daysAgo(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Default preset list — applied across all paginated lists that use the filter. */
export const DEFAULT_DATE_PRESETS: DatePreset[] = [
  {
    id: "this-month",
    label: "This month",
    range: () => {
      const now = new Date();
      return { from: toIsoDate(startOfMonth(now)), to: toIsoDate(now) };
    },
  },
  {
    id: "last-30",
    label: "Last 30 days",
    range: () => {
      const now = new Date();
      return { from: toIsoDate(daysAgo(now, 30)), to: toIsoDate(now) };
    },
  },
  {
    id: "last-90",
    label: "Last 90 days",
    range: () => {
      const now = new Date();
      return { from: toIsoDate(daysAgo(now, 90)), to: toIsoDate(now) };
    },
  },
  {
    id: "this-year",
    label: "This year",
    range: () => {
      const now = new Date();
      return { from: toIsoDate(startOfYear(now)), to: toIsoDate(now) };
    },
  },
];

const DEBOUNCE_MS = 400;

function buildDateHref(
  pathname: string,
  searchParams: URLSearchParams,
  fromName: string,
  toName: string,
  from: string,
  to: string,
): string {
  const next = new URLSearchParams(searchParams);
  // Setting a date filter resets the page to 1 — otherwise we might land on
  // a page that's now empty because the new date range excludes its rows.
  next.delete("page");
  if (from) next.set(fromName, from);
  else next.delete(fromName);
  if (to) next.set(toName, to);
  else next.delete(toName);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Server-side date filter for list pages. Renders two native
 * `<input type="date">` controls + optional preset links + a Clear
 * button. The URL is the source of truth — `router.replace()` navigates
 * instead of pushing client state, so the filter is shareable, refresh-
 * safe, and survives a back-button press.
 *
 * Inputs are debounced (400 ms) so manual typing doesn't spam
 * navigations; blur commits immediately. Presets + Clear commit
 * synchronously. The `searchParams` prop (server-rendered URLSearchParams
 * with `pageSize`/etc.) is preserved across commits so other filter
 * state doesn't get clobbered.
 *
 * @param pathname       Current list pathname (e.g. `/b/.../sales/invoices`).
 * @param searchParams   Server-rendered URLSearchParams (so `pageSize`
 *                       survives a date change).
 * @param initialFrom    ISO date string for `from` from the URL (or "").
 * @param initialTo      ISO date string for `to` from the URL (or "").
 * @param fromName       URL param name for the lower bound. Defaults to "from".
 * @param toName         URL param name for the upper bound. Defaults to "to".
 * @param fromLabel      Visible label for the lower-bound input.
 * @param toLabel        Visible label for the upper-bound input.
 * @param presets        Preset date-range shortcuts. Pass `[]` to disable.
 * @param className      Extra classes for the wrapper.
 */
export function ListDateFilter({
  pathname,
  searchParams,
  initialFrom = "",
  initialTo = "",
  fromName = "from",
  toName = "to",
  fromLabel = "From",
  toLabel = "To",
  presets = DEFAULT_DATE_PRESETS,
  className,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  initialFrom?: string;
  initialTo?: string;
  fromName?: string;
  toName?: string;
  fromLabel?: string;
  toLabel?: string;
  presets?: readonly DatePreset[];
  className?: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync local state when the URL `from`/`to` change (back-button, a
  // preset link, or a programmatic navigation). The React-recommended
  // pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // is to compare the prop with its previous render value and adjust
  // during render — this avoids the cascading-render effect lint rule
  // and the extra render that an effect-with-setState introduces.
  const [prevFrom, setPrevFrom] = useState(initialFrom);
  const [prevTo, setPrevTo] = useState(initialTo);
  if (initialFrom !== prevFrom) {
    setPrevFrom(initialFrom);
    setFrom(initialFrom);
  }
  if (initialTo !== prevTo) {
    setPrevTo(initialTo);
    setTo(initialTo);
  }

  // Cancel any pending debounce on unmount so we don't navigate after
  // the component is gone (e.g. user navigated away mid-type).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const commit = useCallback(
    (nextFrom: string, nextTo: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const href = buildDateHref(pathname, searchParams, fromName, toName, nextFrom, nextTo);
      router.replace(href);
    },
    [pathname, searchParams, fromName, toName, router],
  );

  const debouncedCommit = useCallback(
    (nextFrom: string, nextTo: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const href = buildDateHref(pathname, searchParams, fromName, toName, nextFrom, nextTo);
        router.replace(href);
      }, DEBOUNCE_MS);
    },
    [pathname, searchParams, fromName, toName, router],
  );

  const onFromChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFrom(value);
    debouncedCommit(value, to);
  };

  const onToChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setTo(value);
    debouncedCommit(from, value);
  };

  // Enter commits immediately — saves the user from waiting the 400 ms
  // debounce when they've finished typing and pressed Enter. The
  // debounce still covers calendar-picker drag (which fires onChange
  // once per pick but the user might pick `from` then `to` quickly).
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(from, to);
    }
  };

  const applyPreset = (preset: DatePreset) => {
    const { from: pFrom = "", to: pTo = "" } = preset.range();
    setFrom(pFrom);
    setTo(pTo);
    commit(pFrom, pTo);
  };

  const onClear = () => {
    setFrom("");
    setTo("");
    commit("", "");
  };

  const hasFilter = Boolean(from || to);

  // Inputs get a subtle accent border when their value is set —
  // gives the user a glance-able "this filter is active" cue without
  // needing a separate "Filter active" badge.
  const inputClass = (active: boolean) =>
    cn(
      "h-7 rounded-md border bg-surface px-1.5 py-0 text-xs text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-primary/60 text-foreground" : "border-border text-foreground",
    );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5 text-xs text-muted-foreground",
        hasFilter && "bg-surface-muted/40",
        className,
      )}
    >
      <Calendar className={cn("size-3.5", hasFilter ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{fromLabel}</span>
        <input
          type="date"
          value={from}
          onChange={onFromChange}
          onBlur={() => commit(from, to)}
          onKeyDown={onKeyDown}
          aria-label={fromLabel}
          className={inputClass(Boolean(from))}
        />
      </label>
      <span className="text-muted-foreground" aria-hidden>
        –
      </span>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{toLabel}</span>
        <input
          type="date"
          value={to}
          onChange={onToChange}
          onBlur={() => commit(from, to)}
          onKeyDown={onKeyDown}
          aria-label={toLabel}
          className={inputClass(Boolean(to))}
        />
      </label>
      {presets.length > 0 && (
        <div className="ml-1 flex flex-wrap items-center gap-1">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {hasFilter && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clear date filter"
        >
          <X className="size-3" aria-hidden /> Clear
        </button>
      )}
    </div>
  );
}
