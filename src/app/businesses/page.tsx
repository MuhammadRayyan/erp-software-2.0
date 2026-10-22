import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/core/auth/session";
import { getBusinessQuickKpis, getPinnedBusinessIdsForUser, listBusinessesForUser } from "@/core/businesses/business-service";
import { formatMoney, formatRelativeOpened } from "@/core/format";
import { BusinessList } from "./business-list";
import { ImportDialog } from "./import-dialog";

export const metadata = { title: "My Businesses" };

export default async function BusinessesPage() {
  const user = await requireUser();
  const pinnedSet = getPinnedBusinessIdsForUser(user.id);
  const rows = listBusinessesForUser(user.id).map(({ business, membership }) => {
    const kpis = getBusinessQuickKpis(business.id, user.id);
    return {
      id: business.id,
      name: business.name,
      country: business.country,
      currency: business.currency,
      lastOpened: formatRelativeOpened(business.lastOpenedAt),
      role: membership.role,
      isPinned: pinnedSet.has(business.id),
      kpis: {
        liquidBalance: formatMoney(kpis.liquidBalanceMinor, business.currency),
        outstandingReceivables: formatMoney(kpis.outstandingReceivablesMinor, business.currency),
        hasOutstanding: kpis.outstandingReceivablesMinor > 0,
        overdueCount: kpis.overdueCount,
        overdueTotal: formatMoney(kpis.overdueMinor, business.currency),
        activeEmployees: kpis.activeEmployeesCount,
      },
    };
  });
  const sortedRows = rows.sort((a, b) => {
    const aPin = a.isPinned ? 1 : 0;
    const bPin = b.isPinned ? 1 : 0;
    return bPin - aPin;
  });
  return (
    <main className="page-container max-w-[1050px]">
      {user.isSuperAdmin && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs dark:border-amber-500/40 dark:bg-amber-500/15">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong className="text-foreground">Super-Admin Root Session Active</strong>
              <p className="text-muted-foreground mt-0.5">
                You have platform-level root administrative privileges across all tenant workspaces.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="primary" className="gap-1.5 shrink-0">
            <Link href="/admin">
              Admin Control Panel &rarr;
            </Link>
          </Button>
        </div>
      )}
      <div className="page-header">
        <div><h1 className="page-title">My Businesses</h1><p className="page-description">Open a business or restore a portable backup as a separate copy.</p></div>
        <div className="flex gap-2"><ImportDialog /><Button asChild><Link href="/businesses/new"><Plus className="size-4" /> New Business</Link></Button></div>
      </div>
      <BusinessList businesses={sortedRows} />
    </main>
  );
}
