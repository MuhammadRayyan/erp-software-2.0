import { getBusinessAccess, hasActionPermission, type ModuleKey, type ActionKey } from "./permissions";

/** Domain commands use the same policy as actions and HTTP routes. Never trust a client-supplied role. */
export function assertMutationPermission(
  businessId: string,
  userId: string,
  module: ModuleKey,
  ...actions: ActionKey[]
) {
  if (!userId || actions.length === 0) throw new Error("PERMISSION_DENIED: An authorized actor is required.");
  for (const action of actions) {
    if (!hasActionPermission(businessId, userId, module, action)) {
      throw new Error(`PERMISSION_DENIED: You do not have permission to ${action} records in ${module}.`);
    }
  }
}

export function assertSavePermission(
  businessId: string,
  userId: string,
  module: ModuleKey,
  id?: string | null,
  intent: string = "draft",
) {
  if (!["draft", "post", "issue"].includes(intent)) throw new Error("Invalid document save intent.");
  assertMutationPermission(businessId, userId, module, id ? "edit" : "create");
  if (intent !== "draft") assertMutationPermission(businessId, userId, module, intent === "issue" ? "approve" : "post");
}

export function assertBusinessAdministrator(businessId: string, userId: string) {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const access = getBusinessAccess(businessId, userId);
  if (!access || access.membership.role !== "administrator") {
    throw new Error("PERMISSION_DENIED: Only a business Administrator can perform this action.");
  }
  return access;
}
