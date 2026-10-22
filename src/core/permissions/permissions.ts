import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { businesses, memberships, users } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { moduleKeys, parseModules, type ModuleKey } from "./module-access";

export { moduleKeys, parseModules, type ModuleKey } from "./module-access";

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

  if (row) {
    return {
      ...row,
      isSuperAdmin: isSuper,
      modules: parseModules(row.membership.role, row.membership.modulesJson),
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
        membership: {
          id: `super-admin-${userId}-${businessId}`,
          businessId,
          userId,
          role: "administrator" as const,
          modulesJson: JSON.stringify([...moduleKeys]),
          createdAt: business.createdAt,
        },
        isSuperAdmin: true,
        modules: [...moduleKeys],
      };
    }
  }

  return null;
});

export function canAccessModule(businessId: string, userId: string, module: ModuleKey) {
  return getBusinessAccess(businessId, userId)?.modules.includes(module) ?? false;
}
