"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldValues, UseFormReset, UseFormWatch } from "react-hook-form";

interface StoredDraft<T> {
  version: 1;
  savedAt: number;
  values: T;
}

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function useFormDraftRecovery<T extends FieldValues>({
  storageKey,
  enabled,
  watch,
  reset,
  isDirty,
  isSubmitSuccessful,
}: {
  storageKey: string;
  enabled: boolean;
  watch: UseFormWatch<T>;
  reset: UseFormReset<T>;
  isDirty: boolean;
  isSubmitSuccessful: boolean;
}) {
  const [draft, setDraft] = useState<StoredDraft<T> | null>(null);
  const isDirtyRef = useRef(isDirty);
  const isSubmittedRef = useRef(isSubmitSuccessful);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync synchronously during render so initial watch callbacks see updated state
  isDirtyRef.current = isDirty;
  isSubmittedRef.current = isSubmitSuccessful;

  useEffect(() => {
    if (isSubmitSuccessful && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore storage quota / privacy mode failures.
      }
      setDraft(null);
    }
  }, [isSubmitSuccessful, storageKey]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setDraft(null);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        setDraft(null);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>;
      if (
        parsed &&
        (parsed.version === undefined || parsed.version === 1) &&
        typeof parsed.savedAt === "number" &&
        parsed.values &&
        typeof parsed.values === "object" &&
        Date.now() - parsed.savedAt < DRAFT_MAX_AGE_MS
      ) {
        setDraft({ version: 1, savedAt: parsed.savedAt, values: parsed.values });
      } else {
        window.sessionStorage.removeItem(storageKey);
        setDraft(null);
      }
    } catch {
      setDraft(null);
    }
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const subscription = watch((values, info) => {
      if (isSubmittedRef.current) return;
      if (info.type) {
        setDraft(null);
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!isDirtyRef.current || isSubmittedRef.current) return;
        try {
          const payload: StoredDraft<T> = {
            version: 1,
            savedAt: Date.now(),
            values: values as T,
          };
          window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
        } catch {
          // Ignore storage quota errors.
        }
      }, 1000);
    });
    return () => {
      subscription.unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, storageKey, watch]);

  const clearDraft = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore storage errors.
      }
    }
    setDraft(null);
  }, [storageKey]);

  const preserveDraft = useCallback(
    (values: T) => {
      if (!enabled || typeof window === "undefined") return;
      try {
        const payload: StoredDraft<T> = {
          version: 1,
          savedAt: Date.now(),
          values,
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Ignore storage quota errors.
      }
    },
    [enabled, storageKey],
  );

  const restoreDraft = useCallback(() => {
    if (!draft) return;
    reset(draft.values, { keepDefaultValues: true });
    isDirtyRef.current = true;
    setDraft(null);
  }, [draft, reset]);

  return {
    hasDraft: Boolean(enabled && draft),
    savedAt: draft?.savedAt ?? null,
    restoreDraft,
    discardDraft: clearDraft,
    clearDraft,
    preserveDraft,
  };
}
