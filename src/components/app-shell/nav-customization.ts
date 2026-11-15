import { primaryNav, type NavItem } from "./nav-items";

export const NAV_CUSTOMIZATION_FORM_TYPE = "nav-customization" as const;

export interface NavCustomizationPayload {
  hiddenPaths: string[];
}

export interface NavGroupOption {
  key: string;
  label: string;
  items: Array<{
    path: string;
    label: string;
    module?: NavItem["module"];
    modules?: NavItem["modules"];
  }>;
}

const ORDERED_CONFIGURABLE_PATHS: string[] = primaryNav.flatMap((group) =>
  group.items.map((item) => item.path),
);

const CONFIGURABLE_PATH_SET = new Set<string>(ORDERED_CONFIGURABLE_PATHS);

/** Return the set of every module/sub-module path in `primaryNav` that can be hidden or shown. */
export function getAllConfigurableNavPaths(): Set<string> {
  return new Set(CONFIGURABLE_PATH_SET);
}

/** Return ordered hierarchical group options used by the Customize screen and tests. */
export function getNavGroupOptions(): NavGroupOption[] {
  return primaryNav.map((group) => {
    const label = group.label ?? "General";
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      key,
      label,
      items: group.items.map((item) => ({
        path: item.path,
        label: item.label,
        ...(item.module ? { module: item.module } : {}),
        ...(item.modules ? { modules: item.modules } : {}),
      })),
    };
  });
}

/** Filter and deduplicate raw hidden paths against current `primaryNav` paths in canonical order. */
export function normalizeHiddenNavPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const requested = new Set(
    raw.filter((value): value is string => typeof value === "string" && CONFIGURABLE_PATH_SET.has(value)),
  );
  return ORDERED_CONFIGURABLE_PATHS.filter((path) => requested.has(path));
}

/** Filter navigation groups by hidden paths and omit groups with no remaining items. */
export function filterNavGroups<T extends { items: NavItem[] }>(
  groups: readonly T[],
  hiddenPaths: readonly string[],
): T[] {
  if (!hiddenPaths.length) return [...groups];
  const hiddenSet = new Set(hiddenPaths);
  const out: T[] = [];
  for (const group of groups) {
    const visibleItems = group.items.filter((item) => !hiddenSet.has(item.path));
    if (visibleItems.length > 0) {
      out.push({ ...group, items: visibleItems });
    }
  }
  return out;
}

/** Determine whether a `primaryNav` path is currently visible. */
export function isNavPathVisible(path: string, hiddenPaths: readonly string[]): boolean {
  if (!hiddenPaths.length) return true;
  return !hiddenPaths.includes(path);
}

/**
 * Pick the default business landing path when entering `/b/[businessId]`.
 * Falls back to `/settings` if every `primaryNav` tab has been hidden so users can always restore tabs.
 */
export function resolveDefaultLandingPath(
  hiddenPaths: readonly string[],
  permittedModules?: ReadonlySet<string>,
): string {
  const hiddenSet = new Set(hiddenPaths);
  for (const group of primaryNav) {
    for (const item of group.items) {
      if (hiddenSet.has(item.path)) continue;
      if (permittedModules) {
        if (item.module && !permittedModules.has(item.module)) continue;
        if (item.modules && !item.modules.some((m) => permittedModules.has(m))) continue;
      }
      return item.path;
    }
  }
  return "/settings";
}
