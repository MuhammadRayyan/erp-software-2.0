import Link from "next/link";
import { ArrowRight, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/core/auth/session";
import { listBusinessesForUser } from "@/core/businesses/business-service";
import { formatRelativeOpened } from "@/core/format";
import { BusinessList } from "./business-list";
import { ImportDialog } from "./import-dialog";

export const metadata = { title: "My Businesses" };

export default async function BusinessesPage() {
  const user = await requireUser();
  const rows = listBusinessesForUser(user.id, false, { isolateForSuperAdmin: true }).map(({ business, membership }) => ({
    id: business.id,
    name: business.name,
    country: business.country,
    currency: business.currency,
    lastOpened: formatRelativeOpened(business.lastOpenedAt),
    role: membership.role,
  }));

  return (
    <main className="page-container max-w-[960px]">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Businesses</h1>
          <p className="page-description">Open a business or restore a portable backup as a separate copy.</p>
        </div>
        <div className="flex gap-2">
          <ImportDialog />
          <Button asChild>
            <Link href="/businesses/new">
              <Plus className="size-4" /> New Business
            </Link>
          </Button>
        </div>
      </div>
      {user.isSuperAdmin && (
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/40 dark:bg-amber-500/15">
          <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>Platform Super-Admin:</strong> Showing only your own personal workspaces here. To view and manage all tenant workspaces across the platform, open the Admin Control Panel.
            </span>
          </div>
          <Button asChild size="sm" variant="secondary" className="h-8 shrink-0 gap-1.5 border-amber-500/40 bg-background text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/50">
            <Link href="/admin?tab=businesses">
              All Platform Workspaces <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}
      <BusinessList businesses={rows} />
    </main>
  );
}
