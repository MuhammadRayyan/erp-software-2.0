import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentSession } from "@/core/auth/session";
import { requireModule } from "@/core/permissions/require-module";
import { listPreferences } from "@/modules/preferences/preference-service";
import { PreferencesResetCard } from "@/modules/preferences/preferences-reset-card";

export const metadata = { title: "Display preferences" };

/**
 * Settings page for per-account UI preferences (column visibility, KPI
 * card toggles). Read-only listing of currently-stored keys plus a
 * destructive "Reset to defaults" affordance — useful when a user wants
 * to start fresh after experimenting with column toggles.
 *
 * Re-uses the existing `page-container page-medium` shell from the
 * other settings sub-pages so the visual language stays consistent.
 */
export default async function PreferencesSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  await requireModule(businessId, "settings");

  const session = await getCurrentSession();
  const preferences = session?.user ? listPreferences(businessId, session.user.id) : {};
  const entries = Object.entries(preferences).sort(([a], [b]) => a.localeCompare(b));
  const decoded = entries.map(([key, value]) => {
    if (!key.startsWith("cols.")) return { key, value, decoded: null };
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return { key, value, decoded: parsed as Record<string, unknown> };
      }
    } catch {
      // Ignore — fall through to raw display.
    }
    return { key, value, decoded: null };
  });

  return (
    <div className="page-container page-medium">
      <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">Display preferences</h1>
          <p className="page-description">Per-account UI state synced across devices for this business (column toggles, KPI cards).</p>
        </div>
      </div>

      <PreferencesResetCard businessId={businessId} count={entries.length} />

      <section aria-label="Stored preference keys" className="mt-6">
        <h2 className="mb-3 text-sm font-medium">Stored preference keys</h2>
        {decoded.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm font-medium">No preferences stored yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Toggle columns or KPI cards on list/overview pages — your choices will be synced here automatically.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
            {decoded.map((entry) => (
              <li key={entry.key} className="px-4 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <code className="text-[12px] font-medium text-foreground">{entry.key}</code>
                  {entry.decoded ? (
                    <code className="text-[11px] text-muted-foreground">{Object.keys(entry.decoded).length} hidden flag(s)</code>
                  ) : (
                    <code className="text-[11px] text-muted-foreground truncate max-w-[60%]">{entry.value}</code>
                  )}
                </div>
                {entry.decoded && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(entry.decoded).filter(([, v]) => v === false).map(([col]) => (
                      <li key={col} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] text-muted-foreground">{col} hidden</li>
                    ))}
                    {Object.entries(entry.decoded).filter(([, v]) => v === false).length === 0 && (
                      <li className="text-[11px] text-muted-foreground">All columns visible</li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
