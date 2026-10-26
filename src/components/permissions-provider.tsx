"use client";

import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { hasPermission, moduleForBusinessPath, type ModuleCapabilities, type ActionKey } from "@/core/permissions/module-access";

const PermissionsContext = createContext<{ capabilities: ModuleCapabilities; isAdministrator: boolean } | null>(null);
const DocumentWorkflowContext = createContext<ActionKey | undefined>(undefined);
export function PermissionsProvider({ capabilities, isAdministrator, children }: { capabilities: ModuleCapabilities; isAdministrator: boolean; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={{ capabilities, isAdministrator }}>{children}</PermissionsContext.Provider>;
}

export function useActionPermission(action?: ActionKey | ActionKey[]) {
  const context = useContext(PermissionsContext);
  const workflow = useContext(DocumentWorkflowContext);
  const pathname = usePathname() ?? "";
  const scope = moduleForBusinessPath(pathname);
  if (!action || !context || !scope) return true;
  const { capabilities, isAdministrator } = context;
  const actions = Array.isArray(action) ? action : [action];
  return actions.every(value => {
    const required = value === "save" ? pathname.split("/").includes("edit") ? "edit" : "create" : value;
    if (workflow && ["create", "edit"].includes(required) && !hasPermission(capabilities, scope.module, workflow)) return false;
    if (pathname.includes(`/b/${scope.businessId}/tax/`) && !["view", "export"].includes(required)) return isAdministrator;
    if (pathname.includes("/settings/lock-date") || pathname.includes("/settings/opening-balances")) {
      return hasPermission(capabilities, "settings", "edit") && hasPermission(capabilities, "accounting", "post");
    }
    return hasPermission(capabilities, scope.module, scope.module === "settings" && !["view", "export"].includes(required) ? "edit" : required);
  });
}

export function DocumentWorkflowPermissions({ status, children }: { status?: string; children: React.ReactNode }) {
  const normalized = status?.toLowerCase();
  const workflow = normalized === "posted" ? "post" : normalized === "sent" || normalized === "issued" ? "approve" : undefined;
  const allowed = useActionPermission(workflow);
  return <DocumentWorkflowContext.Provider value={workflow}>
    {allowed ? children : <p role="status" className="text-sm text-muted-foreground">Posting or approval permission is required to change this document. Ask a business administrator.</p>}
  </DocumentWorkflowContext.Provider>;
}
