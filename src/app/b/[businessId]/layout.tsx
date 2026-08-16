import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/core/auth/session";
import { listBusinessesForUser, touchBusiness } from "@/core/businesses/business-service";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { moduleForBusinessPath } from "@/core/permissions/module-access";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) notFound();

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const requirement = moduleForBusinessPath(pathname);
  
  if (requirement && !access.modules.includes(requirement.module)) {
    redirect(`/b/${businessId}/forbidden?module=${requirement.module}`);
  }

  // Throttle touchBusiness via cookie — only update if >5 min since last touch
  const cookieStore = await cookies();
  const touchCookie = cookieStore.get(`bt-${businessId}`)?.value;
  const lastTouch = touchCookie ? Number(touchCookie) : 0;
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  if (now - lastTouch > TOUCH_INTERVAL_MS) {
    touchBusiness(businessId, user.id);
    cookieStore.set(`bt-${businessId}`, String(now), {
      maxAge: 60 * 60 * 24 * 30,  // 30 days
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  const businessList = listBusinessesForUser(user.id).map(({ business }) => ({ id: business.id, name: business.name }));
  return (
    <AppShell business={{ id: access.business.id, name: access.business.name }} businesses={businessList} modules={access.modules} user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
