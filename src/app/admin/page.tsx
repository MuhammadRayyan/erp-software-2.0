import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  Activity,
  Building2,
  HardDrive,
  PauseCircle,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { businesses, memberships, users } from "@/core/db/system-schema";
import {
  formatBytes,
  getBusinessStorageBytes,
  listSystemAuditLogs,
  listTenantsWithStats,
} from "@/core/admin/tenant-service";
import { TenantsTable } from "./tenants-table";
import { BusinessTable, type AdminBusinessRow } from "./business-table";
import { AuditLogTable } from "./audit-log-table";
import { CreateTenantDialog } from "./create-tenant-dialog";

export const metadata = { title: "Admin Control Panel | Ledgerly ERP" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requireSuperAdmin();
  const db = getSystemDb();
  const params = searchParams ? await searchParams : {};
  const currentTab = params.tab || "tenants";

  // Fetch Tenants with stats
  const tenantRows = listTenantsWithStats();

  // Fetch all businesses with admin/owner details
  const allBusinesses = db.select().from(businesses).orderBy(desc(businesses.createdAt)).all();
  const allUsers = db.select().from(users).all();
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  const businessRows: AdminBusinessRow[] = allBusinesses.map((b) => {
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
    const owner = b.ownerUserId ? userMap.get(b.ownerUserId) : null;

    return {
      id: b.id,
      name: b.name,
      country: b.country,
      currency: b.currency,
      directoryKey: b.directoryKey,
      status: b.status,
      archived: b.archived,
      ownerUserId: b.ownerUserId,
      ownerName: owner?.name ?? (admins[0]?.name ?? null),
      ownerEmail: owner?.email ?? (admins[0]?.email ?? null),
      createdAt: b.createdAt,
      lastOpenedAt: b.lastOpenedAt,
      admins,
      storageFormatted: formatBytes(storageBytes),
      storageBytes,
      memberCount,
    };
  });

  const totalStorageBytes = businessRows.reduce((acc, row) => acc + row.storageBytes, 0);
  const clientTenants = tenantRows.filter((t) => !t.isSuperAdmin);
  const activeTenantsCount = tenantRows.filter((t) => t.status === "active").length;
  const suspendedTenantsCount = tenantRows.filter((t) => t.status === "suspended").length;
  const auditLogs = listSystemAuditLogs(100);

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-8 space-y-6">
      {/* Platform Title & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Platform Administration & Tenant Management
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Provision account holders, allocate business & user quotas, isolate tenant data, and audit platform security.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <CreateTenantDialog />
          <Button asChild size="sm" variant="secondary" className="gap-1.5 text-xs">
            <Link href="/api/health" target="_blank">
              <Activity className="size-3.5" /> Engine Health
            </Link>
          </Button>
        </div>
      </div>

      {/* Domain-Aligned Platform KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Account Holders (Main Tenants) */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Account Holders</span>
            <UserCheck className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {clientTenants.length}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {tenantRows.length} total users enrolled
          </span>
        </div>

        {/* Total Businesses */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Businesses</span>
            <Building2 className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{businessRows.length}</div>
          <span className="text-[10px] text-muted-foreground">Isolated ledgers</span>
        </div>

        {/* Platform Users */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Platform Users</span>
            <Users className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{allUsers.length}</div>
          <span className="text-[10px] text-muted-foreground">Tenants + team members</span>
        </div>

        {/* Active Accounts */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active Accounts</span>
            <Shield className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{activeTenantsCount}</div>
          <span className="text-[10px] text-muted-foreground">In good standing</span>
        </div>

        {/* Suspended Accounts */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Suspended</span>
            <PauseCircle className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{suspendedTenantsCount}</div>
          <span className="text-[10px] text-muted-foreground">Access revoked</span>
        </div>

        {/* Storage Utilized */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Storage Utilized</span>
            <HardDrive className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">
            {formatBytes(totalStorageBytes)}
          </div>
          <span className="text-[10px] text-muted-foreground">Across all SQLite DBs</span>
        </div>
      </div>

      {/* Navigation View Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4 text-xs font-medium">
          <Link
            href="/admin?tab=tenants"
            className={`border-b-2 pb-2.5 transition-colors ${
              currentTab === "tenants"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Account Holders (Tenants) ({tenantRows.length})
          </Link>
          <Link
            href="/admin?tab=businesses"
            className={`border-b-2 pb-2.5 transition-colors ${
              currentTab === "businesses"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            All Workspaces ({businessRows.length})
          </Link>
          <Link
            href="/admin?tab=audit"
            className={`border-b-2 pb-2.5 transition-colors ${
              currentTab === "audit"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Platform Audit Log ({auditLogs.length})
          </Link>
        </div>
      </div>

      {/* Tab Contents */}
      <section className="space-y-4">
        {currentTab === "tenants" && <TenantsTable initialTenants={tenantRows} />}
        {currentTab === "businesses" && <BusinessTable initialBusinesses={businessRows} />}
        {currentTab === "audit" && <AuditLogTable logs={auditLogs} />}
      </section>
    </main>
  );
}
