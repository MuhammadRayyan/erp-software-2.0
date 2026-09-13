
"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export type TableDensity = "compact" | "default" | "comfortable";

const STORAGE_KEY = "ledgerly.density";
const SERVER_DEBOUNCE_MS = 500;

let currentDensity: TableDensity = "default";
const listeners = new Set<() => void>();

function readStoredDensity(): TableDensity {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "compact" || raw === "default" || raw === "comfortable") return raw;
  } catch {}
  return "default";
}

function persist(value: TableDensity) {
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch {}
}

function getSnapshot(): TableDensity {
  return currentDensity;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  currentDensity = readStoredDensity();
}

export function useTableDensity(businessId?: string) {
  const density = useSyncExternalStore(subscribe, getSnapshot, (): TableDensity => "default");
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDensity = useCallback((next: TableDensity) => {
    currentDensity = next;
    persist(next);
    listeners.forEach((l) => l());

    if (businessId) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fetch(`/api/businesses/${businessId}/preferences`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: { "density": next } }),
        }).catch(() => {});
      }, SERVER_DEBOUNCE_MS);
    }
  }, [businessId]);

  return { density, setDensity };
}

