import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { businesses, memberships, users } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import {
  moduleKeys,
  parseModules,
  parseCapabilities,
  hasPermission,
  getFullCapabilities,
  getAvailableActionsForModule,
  type ModuleKey,
  type ActionKey,
} from "./module-access";

export {
  moduleKeys,
  parseModules,
  parseCapabilities,
  hasPermission,
  getFullCapabilities,
  getEmptyCapabilities,
  getAvailableActionsForModule,
  getModuleDefinition,
  getAllModuleDefinitions,
  getActionDefinition,
  STANDARD_ACTIONS,
  MODULE_DEFINITIONS,
  ACTION_DEFINITIONS,
  type ModuleKey,
  type ActionKey,
  type StandardAction,
  type ModuleDefinition,
  type ActionDefinition,
  type ModuleCapabilities,
  type ModuleCapabilitiesInput,
} from "./module-access";

export const getBusinessAccess = cache((businessId: string, userId: string) => {
  const row = getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(
      memberships,
      and(eq(memberships.businessId, businesses.id), eq(memberships.userId, userId)),
    )
    .where(and(eq(businesses.id, businessId), eq(businesses.archived, false)))
    .get();

  const user = getSystemDb().select().from(users).where(eq(users.id, userId)).get();
  const isSuper = Boolean(user?.isSuperAdmin);

  if (!user || (user.status === "suspended" && !isSuper)) {
    return null;
  }

  if (row) {
    const isOwner = row.business.ownerUserId === userId;
    const isAdmin = isSuper || isOwner || row.membership.role === "administrator";
    const effectiveRole = isAdmin ? ("administrator" as const) : row.membership.role;
    const capabilities = isAdmin
      ? getFullCapabilities()
      : parseCapabilities(effectiveRole, row.membership.modulesJson);
    const modules = isAdmin
      ? [...moduleKeys]
      : parseModules(effectiveRole, row.membership.modulesJson);

    return {
      ...row,
      user,
      membership: isAdmin ? { ...row.membership, role: "administrator" as const } : row.membership,
      isSuperAdmin: isSuper,
      isOwner,
      modules,
      capabilities,
    };
  }

  if (isSuper) {
    const business = getSystemDb()
      .select()
      .from(businesses)
      .where(and(eq(businesses.id, businessId), eq(businesses.archived, false)))
      .get();

    if (business) {
      return {
        business,
        user,
        membership: {
          id: `super-admin-${userId}-${businessId}`,
          businessId,
          userId,
          role: "administrator" as const,
          modulesJson: JSON.stringify([...moduleKeys]),
          createdAt: business.createdAt,
        },
        isSuperAdmin: true,
        isOwner: business.ownerUserId === userId,
        modules: [...moduleKeys],
        capabilities: getFullCapabilities(),
      };
    }
  }

  return null;
});

export type BusinessAccess = NonNullable<ReturnType<typeof getBusinessAccess>>;

export function canAccessModule(businessId: string, userId: string, module: ModuleKey): boolean {
  return getBusinessAccess(businessId, userId)?.modules.includes(module) ?? false;
}

export function hasModuleAccess(businessId: string, userId: string, module: ModuleKey): boolean {
  return canAccessModule(businessId, userId, module);
}

export function hasActionPermission(
  businessId: string,
  userId: string,
  module: ModuleKey,
  action: ActionKey
): boolean {
  const access = getBusinessAccess(businessId, userId);
  if (!access) return false;
  if (!moduleKeys.includes(module)) return false;

  const availableActions = getAvailableActionsForModule(module);
  const isValidAction =
    availableActions.includes(action) ||
    (action === "approve" && availableActions.includes("post")) ||
    (action === "post" && availableActions.includes("approve"));

  if (!isValidAction) return false;

  if (access.isSuperAdmin || access.isOwner || access.membership.role === "administrator") {
    return true;
  }
  return hasPermission(access.capabilities, module, action);
}

export function canUserPerformAction(
  businessId: string,
  userId: string,
  module: ModuleKey,
  action: ActionKey
): boolean {
  return hasActionPermission(businessId, userId, module, action);
}
