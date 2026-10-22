import { existsSync, statSync } from "node:fs";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  Activity,
  ArrowLeft,
  Building2,
  HardDrive,
  LogOut,
  PauseCircle,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/core/auth/session";
import { getBusinessPaths } from "@/core/db/paths";
import { getSystemDb } from "@/core/db/system";
import { businesses, memberships, users } from "@/core/db/system-schema";
import { BusinessTable, type SuperAdminBusinessRow } from "./business-table";

export const metadata = { title: "Super-Admin Control Plane | Ledgerly ERP" };

function getBusinessStorageBytes(directoryKey: string): number {
  try {
    const paths = getBusinessPaths(directoryKey);
    let total = 0;
    if (existsSync(paths.database)) total += statSync(paths.database).size;
    if (existsSync(`${paths.database}-wal`)) total += statSync(`${paths.database}-wal`).size;
    if (existsSync(`${paths.database}-shm`)) total += statSync(`${paths.database}-shm`).size;
    return total;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default async function SuperAdminPage() {
  const superAdmin = await requireSuperAdmin();
  const db = getSystemDb();

  const allBusinesses = db.select().from(businesses).orderBy(desc(businesses.createdAt)).all();
  const allUsersCount = db.select().from(users).all().length;

  const businessRows: SuperAdminBusinessRow[] = allBusinesses.map((b) => {
    const admins = db
      .select({ name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.businessId, b.id), eq(memberships.role, "administrator")))
      .all();

    const memberCount = db
      .select()
      .from(memberships)
      .where(eq(memberships.businessId, b.id))
      .all().length;

    const storageBytes = getBusinessStorageBytes(b.directoryKey);

    return {
      id: b.id,
      name: b.name,
      country: b.country,
      currency: b.currency,
      directoryKey: b.directoryKey,
      status: b.status,
      archived: b.archived,
      createdAt: b.createdAt,
      lastOpenedAt: b.lastOpenedAt,
      admins,
      storageFormatted: formatBytes(storageBytes),
      storageBytes,
      memberCount,
    };
  });

  const totalStorageBytes = businessRows.reduce((acc, row) => acc + row.storageBytes, 0);

  const activeCount = businessRows.filter((b) => b.status === "active").length;
  const suspendedCount = businessRows.filter((b) => b.status === "suspended").length;

  return (
    <div className="min-h-dvh bg-background">
      {/* Platform Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="hidden text-border sm:inline">|</span>
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
              <ShieldCheck className="size-3.5" /> Super-Admin Control Plane
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="hidden sm:block text-right">
              <div className="font-semibold text-foreground">{superAdmin.name}</div>
              <div className="text-[11px] text-muted-foreground">{superAdmin.email}</div>
            </div>

            <Button asChild size="sm" variant="secondary" className="gap-1.5">
              <Link href="/businesses">
                <ArrowLeft className="size-3.5" /> Tenant Workspaces
              </Link>
            </Button>

            <Button asChild size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground">
              <Link href="/logout">
                <LogOut className="size-3.5" /> Sign out
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl p-4 sm:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Overview & Management</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage tenant isolation, business suspensions, and global storage health across the platform.
          </p>
        </div>

        {/* Global Platform KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Total Workspaces</span>
              <Building2 className="size-4" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">{businessRows.length}</div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Active Tenants</span>
              <Shield className="size-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">{activeCount}</div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Suspended</span>
              <PauseCircle className="size-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600">{suspendedCount}</div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Registered Users</span>
              <Users className="size-4" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">{allUsersCount}</div>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Storage Utilized</span>
              <HardDrive className="size-4" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground font-mono">
              {formatBytes(totalStorageBytes)}
            </div>
          </div>
        </div>

        {/* Interactive Workspace Directory */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Tenant Workspaces</h2>
            <Button asChild size="sm" variant="secondary" className="gap-1.5 text-xs">
              <Link href="/api/health" target="_blank">
                <Activity className="size-3.5" /> Engine Health JSON
              </Link>
            </Button>
          </div>

          <BusinessTable initialBusinesses={businessRows} />
        </section>
      </main>
    </div>
  );
}
