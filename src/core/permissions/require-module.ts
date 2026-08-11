import { redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { getBusinessAccess, type ModuleKey } from "./permissions";

export async function requireModule(businessId: string, module: ModuleKey) {
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) redirect("/businesses");
  if (!access.modules.includes(module)) redirect(`/b/${businessId}/forbidden?module=${module}`);
  return { user, access };
}
