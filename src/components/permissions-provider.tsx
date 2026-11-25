"use client";

import { createContext, useCallback, useContext } from "react";
import { usePathname } from "next/navigation";
import { hasPermission, moduleForBusinessPath, type ModuleCapabilities, type ModuleKey, type ActionKey } from "@/core/permissions/module-access";

const PermissionsContext = createContext<{
  capabilities: ModuleCapabilities;
  isAdministrator: boolean;
  isSuperAdmin: boolean;
  requiresApproval: boolean;
} | null>(null);
const DocumentWorkflowContext = createContext<ActionKey | undefined>(undefined);
export function PermissionsProvider({
  capabilities,
  isAdministrator,
  isSuperAdmin = false,
  requiresApproval = false,
  children,
}: {
  capabilities: ModuleCapabilities;
  isAdministrator: boolean;
  isSuperAdmin?: boolean;
  requiresApproval?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={{ capabilities, isAdministrator, isSuperAdmin, requiresApproval }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  return {
    isAdministrator: context?.isAdministrator ?? false,
    isSuperAdmin: context?.isSuperAdmin ?? false,
    requiresApproval: context?.requiresApproval ?? false,
    hasSettingsModule: Boolean(context?.capabilities?.settings?.length),
  };
}

export function useApprovalPolicy() {
  const context = useContext(PermissionsContext);
  return {
    requiresApproval: context?.requiresApproval ?? false,
    isAdministrator: context?.isAdministrator ?? false,
  };
}

export function usePermissionChecker() {
  const context = useContext(PermissionsContext);
  const workflow = useContext(DocumentWorkflowContext);
  const pathname = usePathname() ?? "";
  const scope = moduleForBusinessPath(pathname);

  return useCallback(
    (action?: ActionKey | ActionKey[], moduleOverride?: ModuleKey | ModuleKey[]) => {
      if (!action || !context) return true;
      const { capabilities, isAdministrator } = context;
      const actions = Array.isArray(action) ? action : [action];

      const evalModule = (mod: ModuleKey, required: ActionKey) =>
        hasPermission(capabilities, mod, mod === "settings" && !["view", "export"].includes(required) ? "edit" : required);

      if (moduleOverride) {
        const modules = Array.isArray(moduleOverride) ? moduleOverride : [moduleOverride];
        return modules.some((mod) =>
          actions.every((value) => {
            const required = value === "save" ? (pathname.split("/").includes("edit") ? "edit" : "create") : value;
            return evalModule(mod, required);
          }),
        );
      }

      const targetModule = scope?.module;
      if (!targetModule) {
        return actions.every((a) => a === "view") || isAdministrator;
      }

      return actions.every((value) => {
        const required = value === "save" ? (pathname.split("/").includes("edit") ? "edit" : "create") : value;
        if (workflow && ["create", "edit"].includes(required) && !hasPermission(capabilities, targetModule, workflow)) return false;
        if (scope && pathname.includes(`/b/${scope.businessId}/tax/`) && !["view", "export"].includes(required)) return isAdministrator;
        if (!["view", "export"].includes(required)) {
          if (pathname.includes("/settings/lock-date")) return isAdministrator;
          if (pathname.includes("/settings/opening-balances")) {
            return hasPermission(capabilities, "settings", "edit") && hasPermission(capabilities, "accounting", "post");
          }
        }
        return evalModule(targetModule, required);
      });
    },
    [context, workflow, pathname, scope],
  );
}

export function useActionPermission(action?: ActionKey | ActionKey[], moduleOverride?: ModuleKey | ModuleKey[]) {
  const check = usePermissionChecker();
  return check(action, moduleOverride);
}

export function DocumentWorkflowPermissions({ status, children }: { status?: string; children: React.ReactNode }) {
  const normalized = status?.toLowerCase();
  const workflow = normalized === "posted" ? "post" : normalized === "sent" || normalized === "issued" || normalized === "active" ? "approve" : undefined;
  const allowed = useActionPermission(workflow);
  return <DocumentWorkflowContext.Provider value={workflow}>
    {allowed ? children : <p role="status" className="text-sm text-muted-foreground">Posting or approval permission is required to change this document. Ask a business administrator.</p>}
  </DocumentWorkflowContext.Provider>;
}
