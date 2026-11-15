"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getNavGroupOptions,
  normalizeHiddenNavPaths,
} from "@/components/app-shell/nav-customization";
import { saveNavCustomizationAction } from "@/modules/preferences/nav-customization-actions";

function TriStateCheckbox({
  id,
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="size-4 rounded border-border-strong accent-primary cursor-pointer disabled:cursor-not-allowed"
    />
  );
}

/** Manager.io-style workspace navigation visibility configurator with tri-state group toggles. */
export function NavCustomizationForm({
  businessId,
  initialHiddenPaths,
  canEdit,
}: {
  businessId: string;
  initialHiddenPaths: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const groups = useMemo(() => getNavGroupOptions(), []);
  const totalCount = useMemo(
    () => groups.reduce((acc, g) => acc + g.items.length, 0),
    [groups],
  );

  const [savedHidden, setSavedHidden] = useState<string[]>(() =>
    normalizeHiddenNavPaths(initialHiddenPaths),
  );
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(
    () => new Set(normalizeHiddenNavPaths(initialHiddenPaths)),
  );
  const [saving, setSaving] = useState(false);

  const currentHidden = useMemo(
    () => normalizeHiddenNavPaths([...hiddenSet]),
    [hiddenSet],
  );
  const visibleCount = totalCount - currentHidden.length;
  const dirty =
    currentHidden.length !== savedHidden.length ||
    currentHidden.some((p, idx) => p !== savedHidden[idx]);

  const toggleGroup = (paths: string[], currentlyAnyVisible: boolean) => {
    setHiddenSet((prev) => {
      const next = new Set(prev);
      for (const path of paths) {
        if (currentlyAnyVisible) next.add(path);
        else next.delete(path);
      }
      return next;
    });
  };

  const toggleItem = (path: string) => {
    setHiddenSet((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleSelectAll = () => {
    setHiddenSet(new Set());
  };

  const handleResetUnsaved = () => {
    setHiddenSet(new Set(savedHidden));
  };

  const handleSave = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const result = await saveNavCustomizationAction(businessId, currentHidden);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const nextSaved = result.hiddenPaths ?? currentHidden;
      setSavedHidden(nextSaved);
      setHiddenSet(new Set(nextSaved));
      toast.success("Workspace modules updated.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-primary" />
          <span>
            <strong className="font-semibold text-foreground">{visibleCount}</strong> of{" "}
            <strong className="font-semibold text-foreground">{totalCount}</strong> sections visible in
            navigation
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentHidden.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canEdit || saving}
              onClick={handleSelectAll}
            >
              Show all
            </Button>
          )}
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={handleResetUnsaved}
            >
              <RotateCcw className="size-3.5" /> Revert
            </Button>
          )}
          <Button
            type="button"
            permission="edit"
            size="sm"
            disabled={!canEdit || saving || !dirty}
            onClick={handleSave}
          >
            <Save className="size-3.5" /> {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const paths = group.items.map((i) => i.path);
          const visibleInGroup = paths.filter((p) => !hiddenSet.has(p)).length;
          const anyChecked = visibleInGroup > 0;
          const indeterminate = visibleInGroup > 0 && visibleInGroup < paths.length;
          const groupInputId = `customize-group-${group.key}`;

          return (
            <section
              key={group.key}
              aria-labelledby={groupInputId}
              className="rounded-lg border border-border bg-surface-raised p-4"
            >
              <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                <label
                  htmlFor={groupInputId}
                  className="flex items-center gap-2.5 text-sm font-semibold text-foreground cursor-pointer select-none"
                >
                  <TriStateCheckbox
                    id={groupInputId}
                    checked={anyChecked}
                    indeterminate={indeterminate}
                    disabled={!canEdit}
                    onChange={() => toggleGroup(paths, anyChecked)}
                  />
                  <span>{group.label}</span>
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {visibleInGroup}/{paths.length}
                </span>
              </div>

              <ul className="mt-3 space-y-2">
                {group.items.map((item) => {
                  const isVisible = !hiddenSet.has(item.path);
                  const itemId = `customize-item-${item.path}`;
                  return (
                    <li key={item.path}>
                      <label
                        htmlFor={itemId}
                        className="flex items-center gap-2.5 rounded px-1.5 py-1 text-sm text-foreground hover:bg-surface-muted/60 cursor-pointer select-none"
                      >
                        <input
                          id={itemId}
                          type="checkbox"
                          checked={isVisible}
                          disabled={!canEdit}
                          onChange={() => toggleItem(item.path)}
                          className="size-4 rounded border-border-strong accent-primary cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className={isVisible ? "" : "text-muted-foreground line-through"}>
                          {item.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
