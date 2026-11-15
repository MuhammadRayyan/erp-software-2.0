import { redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { getHiddenNavPaths } from "@/modules/preferences/nav-customization-service";
import { resolveDefaultLandingPath } from "@/components/app-shell/nav-customization";

export default async function BusinessRoot({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  const hiddenNavPaths = access ? getHiddenNavPaths(businessId, user.id) : [];
  const target = resolveDefaultLandingPath(
    hiddenNavPaths,
    access ? new Set(access.modules) : undefined,
  );
  redirect(`/b/${businessId}${target}`);
}
