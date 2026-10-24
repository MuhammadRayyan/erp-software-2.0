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

export interface ActionDefinition {
  key: StandardAction;
  label: string;
  description: string;
}

export const ACTION_DEFINITIONS: Record<StandardAction, ActionDefinition> = {
  view: { key: "view", label: "View", description: "Read and browse records" },
  create: { key: "create", label: "Create", description: "Create new records & drafts" },
  edit: { key: "edit", label: "Edit", description: "Modify existing records" },
  delete: { key: "delete", label: "Delete", description: "Void, delete, or cancel records" },
  post: { key: "post", label: "Post", description: "Post to general ledger or lock entries" },
  approve: { key: "approve", label: "Approve", description: "Authorize transactions & quotes" },
  export: { key: "export", label: "Export", description: "Download PDF batches, CSV & reports" },
};

export function getActionDefinition(action: ActionKey): ActionDefinition {
  return (
    ACTION_DEFINITIONS[action as StandardAction] ?? {
      key: action as StandardAction,
      label: action.charAt(0).toUpperCase() + action.slice(1),
      description: `Perform ${action} action`,
    }
  );
}

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
      const available = getAvailableActionsForModule(mod);
      const isActionSupported = (a: string) =>
        available.includes(a) ||
        (a === "approve" && available.includes("post")) ||
        (a === "post" && available.includes("approve"));

      if (raw === true || raw === "*") {
        result[mod] = [...available];
      } else if (Array.isArray(raw)) {
        if (raw.includes("*") || raw.includes("all")) {
          result[mod] = [...available];
        } else {
          const filtered = raw
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .filter(isActionSupported);
          if (filtered.length > 0 && !filtered.includes("view") && available.includes("view")) {
            filtered.unshift("view");
          }
          result[mod] = filtered;
        }
      } else if (typeof raw === "object" && raw !== null) {
        const filtered = Object.entries(raw)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([action]) => action)
          .filter(isActionSupported);
        if (filtered.length > 0 && !filtered.includes("view") && available.includes("view")) {
          filtered.unshift("view");
        }
        result[mod] = filtered;
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
 * Incorporates ERP standard action inheritance (e.g., write/post implicitly grants view, post/approve alias)
 * and strictly verifies that the target action is defined and valid for the given module.
 */
export function hasPermission(
  capabilities: ModuleCapabilities | undefined | null,
  module: ModuleKey,
  action: ActionKey
): boolean {
  if (!capabilities) return false;
  if (!moduleKeys.includes(module)) return false;

  const availableActions = getAvailableActionsForModule(module);

  // Workflow equivalence: post and approve are interchangeable workflow terms in ERP
  const isEquivalent = (act: string, target: string) => {
    if (act === target) return true;
    if ((act === "post" && target === "approve") || (act === "approve" && target === "post")) return true;
    return false;
  };

  // If the target action is not a valid action (or workflow equivalent) for this module, deny
  const isValidAction = availableActions.some((a) => isEquivalent(a, action));
  if (!isValidAction) return false;

  const actions = capabilities[module] || [];
  if (actions.length === 0) return false;

  // Wildcard grants all valid actions for this module
  if (actions.includes("*") || actions.includes("all")) return true;

  // Exact action match or workflow alias match
  if (actions.some((a) => isEquivalent(a, action))) return true;

  // View inheritance: Having any operational capability in a module implies read/view access
  if (action === "view" && actions.length > 0) return true;

  return false;
}
