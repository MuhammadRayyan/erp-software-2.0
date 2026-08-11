export const moduleKeys = [
  "sales",
  "purchases",
  "banking",
  "projects",
  "inventory",
  "accounting",
  "reports",
  "settings",
] as const;
export type ModuleKey = (typeof moduleKeys)[number];

export function moduleForBusinessPath(pathname: string): { businessId: string; module: ModuleKey } | null {
  const [, root, businessId, section, subsection] = pathname.split("/");
  if (root !== "b" || !businessId) return null;

  if (section === "customers" || section === "einvoicing") return { businessId, module: "sales" };
  if (section === "sales") {
    return { businessId, module: subsection === "delivery-notes" ? "inventory" : "sales" };
  }
  if (section === "suppliers") return { businessId, module: "purchases" };
  if (section === "purchases") {
    return { businessId, module: subsection === "goods-receipts" ? "inventory" : "purchases" };
  }
  if (section === "banking" || section === "projects" || section === "inventory" || section === "accounting" || section === "reports" || section === "settings") {
    return { businessId, module: section };
  }
  if (section === "tax") return { businessId, module: "reports" };
  return null;
}

export function parseModules(role: "administrator" | "standard", value: string): ModuleKey[] {
  if (role === "administrator") return [...moduleKeys];
  try {
    const parsed = JSON.parse(value) as unknown[];
    return moduleKeys.filter((module) => parsed.includes(module));
  } catch {
    return [];
  }
}
