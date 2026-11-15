import Link from "next/link";
import {
  Building2,
  HardDrive,
  Mail,
  PauseCircle,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { requireSuperAdmin } from "@/core/auth/session";
import {
  formatBytes,
  getAdminPageData,
  type AdminControlTab,
} from "@/core/admin/tenant-service";
import { getGlobalEmailConfigStatus } from "@/modules/email/email-driver";
import { TenantsTable } from "./tenants-table";
import { BusinessTable } from "./business-table";
import { AuditLogTable } from "./audit-log-table";
import { CreateTenantDialog } from "./create-tenant-dialog";

export const metadata = { title: "Admin Control Panel | UAE Manager" };

function resolveAdminTab(raw?: string): AdminControlTab {
  if (raw === "businesses" || raw === "audit") return raw;
  return "tenants";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requireSuperAdmin();
  const params = searchParams ? await searchParams : {};
  const currentTab = resolveAdminTab(params.tab);

  const { stats, tenantRows, businessRows, auditLogs } = getAdminPageData(currentTab);
  const emailStatus = getGlobalEmailConfigStatus();

  return (
    <main className="page-container max-w-7xl py-6 space-y-6">
      {/* Platform Title & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Platform Administration & Tenant Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provision account holders, allocate business & user quotas, isolate tenant data, and audit platform security.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/engine-health"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              emailStatus.configured
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300"
            }`}
            title={
              emailStatus.configured
                ? "Global SMTP active"
                : "Global SMTP unconfigured (click for details)"
            }
          >
            <Mail className="size-3.5" />
            <span>Email: {emailStatus.configured ? "Active" : "Unconfigured"}</span>
          </Link>
          <CreateTenantDialog />
        </div>
      </div>

      {/* Domain-Aligned Platform KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {/* Account Holders (Main Tenants) */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Account Holders</span>
            <UserCheck className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {stats.clientTenantsCount}
          </div>
          <span className="text-xs text-muted-foreground">
            {stats.totalTenantsCount} total account holders
          </span>
        </div>

        {/* Total Businesses */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Total Businesses</span>
            <Building2 className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{stats.totalBusinessesCount}</div>
          <span className="text-xs text-muted-foreground">Isolated ledgers</span>
        </div>

        {/* Platform Users */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Platform Users</span>
            <Users className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{stats.totalUsersCount}</div>
          <span className="text-xs text-muted-foreground">Tenants + team members</span>
        </div>

        {/* Active Accounts */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Active Accounts</span>
            <Shield className="size-5 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{stats.activeTenantsCount}</div>
          <span className="text-xs text-muted-foreground">In good standing</span>
        </div>

        {/* Suspended Accounts */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Suspended</span>
            <PauseCircle className="size-5 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{stats.suspendedTenantsCount}</div>
          <span className="text-xs text-muted-foreground">Access revoked</span>
        </div>

        {/* Storage Utilized */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Storage Utilized</span>
            <HardDrive className="size-5 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">
            {formatBytes(stats.totalStorageBytes)}
          </div>
          <span className="text-xs text-muted-foreground">Across all SQLite DBs</span>
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
