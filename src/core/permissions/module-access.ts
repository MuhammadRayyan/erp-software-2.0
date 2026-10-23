export const moduleKeys = [
  "sales",
  "purchases",
  "banking",
  "projects",
  "inventory",
  "accounting",
  "reports",
  "payroll",
  "settings",
] as const;
export type ModuleKey = (typeof moduleKeys)[number];

export const STANDARD_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "post",
  "approve",
  "export",
] as const;
export type StandardAction = (typeof STANDARD_ACTIONS)[number];
export type ActionKey = StandardAction | (string & {});

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  actions: readonly ActionKey[];
}

export const MODULE_DEFINITIONS: Record<ModuleKey, ModuleDefinition> = {
  sales: {
    key: "sales",
    label: "Sales & Invoicing",
    description: "Customers, quotes, sales orders, invoices, and credit notes",
    actions: ["view", "create", "edit", "delete", "post", "approve", "export"],
  },
  purchases: {
    key: "purchases",
    label: "Purchases & Bills",
    description: "Suppliers, purchase quotes, purchase orders, bills, and debit notes",
    actions: ["view", "create", "edit", "delete", "post", "approve", "export"],
  },
  banking: {
    key: "banking",
    label: "Banking & Accounts",
    description: "Bank accounts, statements, reconciliations, and inter-account transfers",
    actions: ["view", "create", "edit", "delete", "post", "export"],
  },
  projects: {
    key: "projects",
    label: "Projects",
    description: "Project tracking, customer billing assignments, and job costing",
    actions: ["view", "create", "edit", "delete", "export"],
  },
  inventory: {
    key: "inventory",
    label: "Inventory",
    description: "Items, stock levels, delivery notes, goods receipts, and adjustments",
    actions: ["view", "create", "edit", "delete", "post", "export"],
  },
  accounting: {
    key: "accounting",
    label: "General Ledger & Accounting",
    description: "Chart of accounts, manual journal entries, period locks, and recoding",
    actions: ["view", "create", "edit", "delete", "post", "export"],
  },
  reports: {
    key: "reports",
    label: "Financial Reports & VAT",
    description: "Balance sheet, P&L, general ledger, trial balance, and tax returns",
    actions: ["view", "export"],
  },
  payroll: {
    key: "payroll",
    label: "HR & Payroll",
    description: "Employees, pay runs, payslips, deductions, and salary advances",
    actions: ["view", "create", "edit", "delete", "post", "approve", "export"],
  },
  settings: {
    key: "settings",
    label: "Settings & Administration",
    description: "Business profile, numbering series, custom fields, and email dispatch",
    actions: ["view", "edit", "export"],
  },
};

export type ModuleCapabilities = Record<ModuleKey, ActionKey[]>;

export type ModuleCapabilitiesInput =
  | ModuleKey[]
  | Partial<Record<ModuleKey, ActionKey[] | Record<string, boolean> | boolean>>
  | Record<string, unknown>;

export function getModuleDefinition(module: string): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS[module as ModuleKey];
}

export function getAllModuleDefinitions(): ModuleDefinition[] {
  return moduleKeys.map((key) => MODULE_DEFINITIONS[key]);
}

export function getAvailableActionsForModule(module: ModuleKey): readonly ActionKey[] {
  return MODULE_DEFINITIONS[module]?.actions ?? STANDARD_ACTIONS;
}

export function getFullCapabilities(): ModuleCapabilities {
  const result = {} as ModuleCapabilities;
  for (const mod of moduleKeys) {
    result[mod] = [...getAvailableActionsForModule(mod)];
  }
  return result;
}

export function getEmptyCapabilities(): ModuleCapabilities {
  const result = {} as ModuleCapabilities;
  for (const mod of moduleKeys) {
    result[mod] = [];
  }
  return result;
}

export function moduleForBusinessPath(pathname: string): { businessId: string; module: ModuleKey } | null {
  const [, root, businessId, section, subsection] = pathname.split("/");
  if (root !== "b" || !businessId) return null;

  if (section === "customers") return { businessId, module: "sales" };
  if (section === "sales") {
    return { businessId, module: subsection === "delivery-notes" ? "inventory" : "sales" };
  }
  if (section === "suppliers") return { businessId, module: "purchases" };
  if (section === "purchases") {
    return { businessId, module: subsection === "goods-receipts" ? "inventory" : "purchases" };
  }
  if (section === "settings") {
    if (subsection === "activity-log" || subsection === "profile") return null;
    return { businessId, module: "settings" };
  }
  if (section === "payroll") return { businessId, module: "payroll" };
  if (
    section === "banking" ||
    section === "projects" ||
    section === "inventory" ||
    section === "accounting" ||
    section === "reports"
  ) {
    return { businessId, module: section };
  }
  if (section === "tax") return { businessId, module: "reports" };
  return null;
}

/**
 * Normalizes any stored permission schema (legacy string array, capability map, or boolean object)
 * into a standardized ModuleCapabilities dictionary.
 *
 * Backward Compatibility Guarantee:
 * Legacy string arrays like `["sales", "purchases"]` automatically expand to all available
 * actions for those modules by default.
 */
export function parseCapabilities(
  role: "administrator" | "standard",
  value: string | unknown
): ModuleCapabilities {
  if (role === "administrator") return getFullCapabilities();
  if (value == null || value === "") return getEmptyCapabilities();

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return getEmptyCapabilities();
    }
  }

  const result = getEmptyCapabilities();

  // Legacy format: string[] e.g. ["sales", "purchases"]
  if (Array.isArray(parsed)) {
    for (const mod of moduleKeys) {
      if (parsed.includes(mod)) {
        result[mod] = [...getAvailableActionsForModule(mod)];
      }
    }
    return result;
  }

  // Structured capability map: { sales: ["view", "create"], purchases: { view: true } }
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    // Support wildcard at root level e.g. { "*": ["*"] } or { "*": true }
    const rootWildcard = obj["*"] === true || (Array.isArray(obj["*"]) && obj["*"].includes("*"));
    if (rootWildcard) return getFullCapabilities();

    for (const mod of moduleKeys) {
      const raw = obj[mod];
      if (raw === true || raw === "*") {
        result[mod] = [...getAvailableActionsForModule(mod)];
      } else if (Array.isArray(raw)) {
        if (raw.includes("*") || raw.includes("all")) {
          result[mod] = [...getAvailableActionsForModule(mod)];
        } else {
          result[mod] = raw.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0
          );
        }
      } else if (typeof raw === "object" && raw !== null) {
        result[mod] = Object.entries(raw)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([action]) => action);
      }
    }
    return result;
  }

  return result;
}

/**
 * Backward compatibility parser: Returns an array of accessible ModuleKeys.
 * Handles both legacy arrays and structured capability maps.
 */
export function parseModules(role: "administrator" | "standard", value: string | unknown): ModuleKey[] {
  if (role === "administrator") return [...moduleKeys];
  if (value == null || value === "") return [];

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) {
    return moduleKeys.filter((module) => parsed.includes(module));
  }

  if (typeof parsed === "object" && parsed !== null) {
    const caps = parseCapabilities(role, parsed);
    return moduleKeys.filter((module) => caps[module] && caps[module].length > 0);
  }

  return [];
}

/**
 * Evaluates whether a user's capabilities grant permission to perform a specific action within a module.
 * Incorporates ERP standard action inheritance (e.g., write/post implicitly grants view, post/approve alias).
 */
export function hasPermission(
  capabilities: ModuleCapabilities | undefined | null,
  module: ModuleKey,
  action: ActionKey
): boolean {
  if (!capabilities) return false;
  const actions = capabilities[module] || [];
  if (actions.length === 0) return false;

  // Wildcard grants everything for this module
  if (actions.includes("*") || actions.includes("all")) return true;

  // Exact action match
  if (actions.includes(action)) return true;

  // Action equivalence and workflow aliases
  if (action === "approve" && actions.includes("post")) return true;
  if (action === "post" && actions.includes("approve")) return true;

  // View inheritance: Having any capability in a module implies read/view access
  if (action === "view" && actions.length > 0) return true;

  return false;
}
