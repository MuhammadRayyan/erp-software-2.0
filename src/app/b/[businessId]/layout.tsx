import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/core/auth/session";
import { touchBusiness } from "@/core/businesses/business-service";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { moduleForBusinessPath } from "@/core/permissions/module-access";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) notFound();

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const isSuspendedRoute = pathname.includes(`/b/${businessId}/suspended`);
  const isSuper = Boolean(user.isSuperAdmin);
  const isSuspended = access.business.status === "suspended";

  if (isSuspended && !isSuper) {
    if (!isSuspendedRoute) {
      redirect(`/b/${businessId}/suspended`);
    }
    return (
      <div className="min-h-dvh bg-background">
        {children}
      </div>
    );
  }

  if (!isSuspended && isSuspendedRoute) {
    redirect(`/b/${businessId}/overview`);
  }

  const requirement = moduleForBusinessPath(pathname);
  
  if (requirement && !access.modules.includes(requirement.module)) {
    redirect(`/b/${businessId}/forbidden?module=${requirement.module}`);
  }

  // touchBusiness has its own in-memory throttle to prevent DB thrashing
  touchBusiness(businessId, user.id);

  return (
    <AppShell
      business={{ id: access.business.id, name: access.business.name }}
      modules={access.modules}
      user={{ name: user.name, email: user.email, isSuperAdmin: isSuper }}
    >
      {isSuspended && isSuper && (
        <div className="sticky top-14 z-30 flex items-center justify-between border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">⚠️</span>
            <span>
              <strong>Super-Admin Live View:</strong> This business is currently suspended for tenant users.
            </span>
          </div>
          <Link
            href="/admin"
            className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-900 underline hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
          >
            Manage in Admin Panel &rarr;
          </Link>
        </div>
      )}
      {children}
    </AppShell>
  );
}
