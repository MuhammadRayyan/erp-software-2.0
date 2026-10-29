import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/core/auth/session";
import {
  getBusinessAccess,
  hasActionPermission,
  type ModuleKey,
  type ActionKey,
  type BusinessAccess,
} from "./permissions";
import { getSystemDb } from "@/core/db/system";
import { users } from "@/core/db/system-schema";
import { assertMutationPermission, assertSavePermission } from "./mutation-permissions";

export async function requireModule(businessId: string, module: ModuleKey) {
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) redirect("/businesses");
  if (!hasActionPermission(businessId, user.id, module, "view")) redirect(`/b/${businessId}/forbidden?module=${module}`);
  return { user, access };
}

export async function requireAnyModule(businessId: string, modules: readonly ModuleKey[]) {
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) redirect("/businesses");
  const hasAny = modules.some((m) => hasActionPermission(businessId, user.id, m, "view"));
  if (!hasAny) redirect(`/b/${businessId}/forbidden?module=${modules.join(",")}`);
  return { user, access };
}

/**
 * Standardized server-side guard to enforce fine-grained action permissions on a business module.
 *
 * Supported call signatures:
 * 1. `requirePermission(businessId, module, action)`: extracts user from active Next.js session.
 * 2. `requirePermission(businessId, userId, module, action)`: verifies permissions for a specific user ID.
 *
 * Throws `PERMISSION_DENIED` if unauthorized, or returns `{ user, access }`.
 */
export async function requirePermission(
  businessId: string,
  module: ModuleKey,
  action: ActionKey
): Promise<{ user: { id: string; name: string; email: string; isSuperAdmin?: boolean }; access: BusinessAccess }>;
export async function requirePermission(
  businessId: string,
  userId: string,
  module: ModuleKey,
  action: ActionKey
): Promise<{ user: { id: string; name: string; email: string; isSuperAdmin?: boolean }; access: BusinessAccess }>;
export async function requirePermission(
  businessId: string,
  arg2: string | ModuleKey,
  arg3: ModuleKey | ActionKey,
  arg4?: ActionKey
): Promise<{ user: { id: string; name: string; email: string; isSuperAdmin?: boolean }; access: BusinessAccess }> {
  let userId: string;
  let targetModule: ModuleKey;
  let action: ActionKey;
  let currentUser: { id: string; name: string; email: string; isSuperAdmin?: boolean } | null = null;

  if (typeof arg4 === "string") {
    // Signature: requirePermission(businessId, userId, module, action)
    userId = arg2 as string;
    targetModule = arg3 as ModuleKey;
    action = arg4;
  } else {
    // Signature: requirePermission(businessId, module, action)
    currentUser = await requireUser();
    userId = currentUser.id;
    targetModule = arg2 as ModuleKey;
    action = arg3 as ActionKey;
  }

  const access = getBusinessAccess(businessId, userId);
  if (!access) {
    throw new Error(`BUSINESS_ACCESS_DENIED: Access denied to business workspace ${businessId}`);
  }

  const allowed = hasActionPermission(businessId, userId, targetModule, action);
  if (!allowed) {
    throw new Error(
      `PERMISSION_DENIED: Action '${action}' on module '${targetModule}' is not permitted.`
    );
  }

  if (!currentUser) {
    const userRow = getSystemDb().select().from(users).where(eq(users.id, userId)).get();
    currentUser = userRow
      ? {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
          isSuperAdmin: userRow.isSuperAdmin,
        }
      : { id: userId, name: "User", email: "", isSuperAdmin: false };
  }

  return { user: currentUser, access };
}

/**
 * Standardized alias for requirePermission.
 */
export const assertBusinessPermission = requirePermission;

export async function requireSavePermission(businessId: string, module: ModuleKey, id?: string | null, intent = "draft") {
  const user = await requireUser();
  assertSavePermission(businessId, user.id, module, id, intent);
  return { user, access: getBusinessAccess(businessId, user.id)! };
}

export async function requireMutationPermission(businessId: string, module: ModuleKey, ...actions: ActionKey[]) {
  const user = await requireUser();
  assertMutationPermission(businessId, user.id, module, ...actions);
  return { user, access: getBusinessAccess(businessId, user.id)! };
}

export async function requireInputSavePermission(businessId: string, module: ModuleKey, input: unknown) {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return requireSavePermission(businessId, module, typeof record.id === "string" ? record.id : undefined, record.autoPost === true ? "post" : "draft");
}
