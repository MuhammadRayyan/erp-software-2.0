"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/** Column/card visibility map shared by list tables and dashboard widgets. */
export type ColumnVisibility = Record<string, boolean>;

const STORAGE_PREFIX = "ledgerly.cols.";

type StoreEntry = { initial: ColumnVisibility; value: ColumnVisibility };

// Module-level external store: the current visibility map per storage key plus
// its subscribers. All components using the same key re-render together.
const entries = new Map<string, StoreEntry>();
const listeners = new Map<string, Set<() => void>>();

function readStoredVisibility(storageKey: string, initial: ColumnVisibility): ColumnVisibility {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    if (!raw) return initial;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return initial;
    const stored: ColumnVisibility = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") stored[key] = value;
    }
    // Spread initial first so columns added later (e.g. new custom fields)
    // default to visible while previously toggled columns keep their state.
    return { ...initial, ...stored };
  } catch {
    return initial;
  }
}

function persist(storageKey: string, value: ColumnVisibility) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(value));
  } catch {
    // Persistence is best-effort (private mode / quota exceeded).
  }
}

function entryFor(storageKey: string, initial: ColumnVisibility): StoreEntry {
  const existing = entries.get(storageKey);
  if (existing && existing.initial === initial) return existing;
  // First client read — or the caller's `initial` changed (e.g. a new
  // custom-field column was defined) — so rebuild the merged snapshot.
  // `initial` must be referentially stable between renders (memoize it at
  // the call site) so the snapshot stays cached while nothing changes.
  const entry: StoreEntry = { initial, value: readStoredVisibility(storageKey, initial) };
  entries.set(storageKey, entry);
  return entry;
}

/**
 * Optional server-side sync configuration. When provided, the hook also
 * persists column visibility to `/api/businesses/[businessId]/preferences`
 * so toggles survive device changes and browser-data clears. The
 * localStorage mirror stays as a fast hydration cache.
 */
export type ServerSyncConfig = {
  /** Active business id — must match the URL param. */
  businessId: string;
  /**
   * Server-loaded snapshot for this storage key (already decoded from the
   * `Record<string,string>` returned by the preferences API). Used as the
   * initial merged baseline so server render and first client render agree
   * on which columns are visible — no hydration mismatch, no flicker.
   */
  serverSnapshot?: ColumnVisibility;
};

const SERVER_DEBOUNCE_MS = 500;

function buildServerSnapshot(storageKey: string, serverSnapshot: ColumnVisibility | undefined, initial: ColumnVisibility): ColumnVisibility {
  if (!serverSnapshot) return initial;
  // Apply server snapshot on top of `initial` so newly-added columns
  // (e.g. a new custom field) still default to visible when the user has
  // not explicitly toggled them.
  return { ...initial, ...serverSnapshot };
}

function useDebouncedServerSync(businessId: string, storageKey: string, enabled: boolean) {
  const pendingRef = useRef<ColumnVisibility | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  return useCallback(
    (next: ColumnVisibility) => {
      if (!enabled) return;
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const payload = pendingRef.current;
        if (!payload) return;
        timerRef.current = null;
        // Wait for the previous save to complete before issuing the next
        // one — keeps the preferences endpoint write-consistent.
        const run = async () => {
          try {
            await fetch(`/api/businesses/${businessId}/preferences`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ preferences: { [`cols.${storageKey}`]: JSON.stringify(payload) } }),
            });
          } catch {
            // Best-effort: the localStorage mirror already has the value;
            // server sync can retry on the next toggle. Silent fail.
          }
        };
        inFlightRef.current = (inFlightRef.current ?? Promise.resolve()).then(run, run);
      }, SERVER_DEBOUNCE_MS);
    },
    [businessId, storageKey, enabled],
  );
}

/**
 * Column visibility state persisted to localStorage under
 * `ledgerly.cols.${storageKey}` (fast hydration cache) and, optionally,
 * to the per-account server-side preferences store for cross-device sync.
 * Falls back to `initial` when nothing is stored or the stored payload is
 * malformed.
 *
 * The server render and the matching first client render always show the
 * `initial` defaults; the persisted map is applied right after hydration via
 * useSyncExternalStore, so restoring hidden columns/cards never produces a
 * React hydration mismatch. `toggle` flips a key and treats undefined entries
 * as visible (true); `setAll` also accepts updater functions.
 *
 * When `serverSync` is provided, the merged baseline becomes
 * `{...initial, ...serverSync.serverSnapshot}` instead of `initial`-only,
 * and `setAll` debounces a PUT to the preferences API so toggles sync across
 * devices. The localStorage mirror continues to update synchronously.
 */
export function useColumnVisibility(
  storageKey: string,
  initial: ColumnVisibility,
  serverSync?: ServerSyncConfig,
) {
  const effectiveInitial = buildServerSnapshot(storageKey, serverSync?.serverSnapshot, initial);
  // Server sync is enabled whenever a businessId is present — even when
  // the snapshot itself is empty/undefined (i.e. first-time user). This
  // guarantees the first toggle ever persists to the server, breaking
  // the chicken-and-egg cycle where sync would otherwise stay off until
  // the user already had something stored.
  const serverSyncEnabled = Boolean(serverSync?.businessId);

  const subscribe = useCallback(
    (listener: () => void) => {
      let subscribers = listeners.get(storageKey);
      if (!subscribers) {
        subscribers = new Set();
        listeners.set(storageKey, subscribers);
      }
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    [storageKey],
  );

  const getSnapshot = useCallback(
    () => entryFor(storageKey, effectiveInitial).value,
    [storageKey, effectiveInitial],
  );

  const visibility = useSyncExternalStore(subscribe, getSnapshot, () => effectiveInitial);

  const serverPush = useDebouncedServerSync(serverSync?.businessId ?? "", storageKey, serverSyncEnabled);

  const setAll = useCallback(
    (update: ColumnVisibility | ((current: ColumnVisibility) => ColumnVisibility)) => {
      const current = entryFor(storageKey, effectiveInitial).value;
      const next = typeof update === "function" ? update(current) : update;
      entries.set(storageKey, { initial: effectiveInitial, value: next });
      persist(storageKey, next);
      serverPush(next);
      listeners.get(storageKey)?.forEach((listener) => listener());
    },
    [storageKey, effectiveInitial, serverPush],
  );

  const toggle = useCallback(
    (key: string) => {
      setAll((current: ColumnVisibility) => ({ ...current, [key]: !current[key] }));
    },
    [setAll],
  );

  // On mount with a server snapshot, also hydrate localStorage so the
  // first offline reload still has the toggles available.
  useEffect(() => {
    if (!serverSync?.serverSnapshot) return;
    const current = entryFor(storageKey, effectiveInitial).value;
    persist(storageKey, current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { visibility, toggle, setAll };
}
