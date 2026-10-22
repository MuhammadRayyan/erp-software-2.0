import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";

export const metadata = { title: "Business Suspended" };

export default async function SuspendedBusinessPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);

  // If business is not suspended, redirect back to standard overview
  if (!access || access.business.status !== "suspended") {
    redirect(`/b/${businessId}/overview`);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface-raised p-8 text-center shadow-xl dark:shadow-none">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <AlertTriangle className="size-7" />
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
          Business Service Suspended
        </h1>

        <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
          This business service has been temporarily suspended by the platform administrator.
        </p>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Workspace data for <span className="font-semibold text-foreground">{access.business.name}</span> is securely
          preserved and protected. If you believe this suspension is in error or require administrative assistance, please
          contact your platform administrator.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button asChild variant="secondary" className="gap-2">
            <Link href="/businesses">
              <ArrowLeft className="size-4" /> Return to My Businesses
            </Link>
          </Button>

          {user.isSuperAdmin ? (
            <Button asChild variant="primary" className="gap-2">
              <Link href="/super-admin">
                <ShieldAlert className="size-4" /> Super-Admin Control Plane
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
