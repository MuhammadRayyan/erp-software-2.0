import Link from "next/link";
import { LayoutDashboard, ShieldCheck } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/core/auth/session";

export const metadata = {
  title: "Admin Control Panel | Ledgerly ERP",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const superAdmin = await requireSuperAdmin();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-surface/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/businesses" className="shrink-0">
              <BrandMark />
            </Link>
            <span className="hidden text-border sm:inline">|</span>
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
              <ShieldCheck className="size-3.5" /> Admin Control Panel
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="secondary" className="gap-1.5 text-xs">
              <Link href="/businesses">
                <LayoutDashboard className="size-3.5" /> Switch to Business Overview
              </Link>
            </Button>

            <AccountMenu
              user={{ name: superAdmin.name, email: superAdmin.email, isSuperAdmin: true }}
              isInsideAdmin={true}
            />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
