import { and, eq } from "drizzle-orm";
import { businesses, memberships } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { parseModules, type ModuleKey } from "./module-access";

export { moduleKeys, parseModules, type ModuleKey } from "./module-access";

export function getBusinessAccess(businessId: string, userId: string) {
  const row = getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(
      memberships,
      and(eq(memberships.businessId, businesses.id), eq(memberships.userId, userId)),
    )
    .where(and(eq(businesses.id, businessId), eq(businesses.archived, false)))
    .get();
  if (!row) return null;
  return { ...row, modules: parseModules(row.membership.role, row.membership.modulesJson) };
}

export function canAccessModule(businessId: string, userId: string, module: ModuleKey) {
  return getBusinessAccess(businessId, userId)?.modules.includes(module) ?? false;
}
