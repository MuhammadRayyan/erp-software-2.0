import { Suspense } from "react";
import Link from "next/link";
import { LayoutDashboard, ShieldCheck } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/core/auth/session";
import { getAdminNavCounts } from "@/core/admin/tenant-service";
import { AdminNavTabs } from "./admin-nav-tabs";

export const metadata = {
  title: "Admin Control Panel | UAE Manager",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const superAdmin = await requireSuperAdmin();
  const counts = getAdminNavCounts();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/businesses" className="flex items-center gap-2.5">
              <BrandMark />
            </Link>
            <span className="hidden text-border sm:inline">|</span>
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
              <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400" /> Admin Control Panel
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild variant="secondary" size="sm" className="gap-2 text-sm text-foreground">
              <Link href="/businesses">
                <LayoutDashboard className="size-4 text-muted-foreground" />
                <span className="hidden sm:inline">Switch to Business Overview</span>
                <span className="sm:hidden">Businesses</span>
              </Link>
            </Button>

            <AccountMenu
              user={{ name: superAdmin.name, email: superAdmin.email, isSuperAdmin: true }}
              isInsideAdmin={true}
            />
          </div>
        </div>
      </header>
      <Suspense fallback={<div className="h-[41px] border-b border-border bg-surface/50" />}>
        <AdminNavTabs counts={counts} />
      </Suspense>
      {children}
    </div>
  );
}
