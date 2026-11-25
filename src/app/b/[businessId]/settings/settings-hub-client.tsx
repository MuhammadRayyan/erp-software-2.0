"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getVisibleSettingsGroups } from "@/modules/settings/settings-registry";

export function SettingsHubClient({
  businessId,
  vatRegistered,
  isSuperAdmin = false,
  isAdmin = true,
  initialQuery,
}: {
  businessId: string;
  vatRegistered: boolean;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");

  const groups = useMemo(
    () =>
      getVisibleSettingsGroups({
        businessId,
        vatRegistered,
        isAdmin,
        isSuperAdmin,
        hasSettingsModule: true,
      }),
    [businessId, vatRegistered, isSuperAdmin, isAdmin],
  );

  const visibleGroups = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.toLowerCase().trim();
    return groups
      .map((group) => {
        if (group.category.toLowerCase().includes(q)) return group;
        return {
          ...group,
          items: group.items.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.subtitle.toLowerCase().includes(q) ||
              item.keywords.toLowerCase().includes(q),
          ),
        };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const totalResults = visibleGroups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              if (next.trim()) url.searchParams.set("q", next);
              else url.searchParams.delete("q");
              window.history.replaceState(null, "", url.toString());
            }
          }}
          placeholder="Search settings (e.g. TRN, logo, numbering, date format, VAT, email, bank rules, users)…"
          className="h-10 w-full rounded-lg border border-border-strong bg-surface-raised pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground shadow-xs outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear settings search"
            onClick={() => {
              setQuery("");
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.delete("q");
                window.history.replaceState(null, "", url.toString());
              }
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No settings match &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-xs text-muted-foreground">Try searching with another keyword.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.delete("q");
                window.history.replaceState(null, "", url.toString());
              }
            }}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Clear search & show all settings
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {query.trim() && (
            <p className="text-xs font-medium text-muted-foreground">
              Showing {totalResults} setting{totalResults === 1 ? "" : "s"} matching &ldquo;{query}&rdquo;
            </p>
          )}

          {visibleGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-border bg-surface-raised p-4 sm:p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <group.icon className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">{group.category}</h3>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {group.description}
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex min-h-[72px] items-start justify-between gap-2.5 rounded-lg border border-border/80 bg-surface p-3.5 transition-all hover:border-primary/50 hover:bg-surface-muted/50 hover:shadow-2xs"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface-raised text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                        <item.icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                            {item.title}
                          </span>
                          {item.badge && (
                            <Badge
                              tone={item.tone ?? "neutral"}
                              className="text-[10px] font-medium px-1.5 py-0 leading-tight shrink-0"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-primary group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
