import { statSync } from "node:fs";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { getBusinessPaths, SYSTEM_DB_PATH } from "@/core/db/paths";
import { openBusinessDatabase } from "@/core/db/business";
import { getSystemSqlite } from "@/core/db/system";
import { getRecentLogs } from "@/core/logger";
import { SettingsShell } from "@/components/settings-shell";
import { SystemHealthClient, type SystemHealthData } from "./system-health-client";

export const metadata = {
  title: "System Health & Observability",
};

export default async function SystemHealthPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  if (!user.isSuperAdmin) {
    notFound();
  }

  const businessEntry = getBusinessForUser(businessId, user.id);
  if (!businessEntry) {
    notFound();
  }

  // 1. Process & Memory Metrics
  const uptimeSeconds = Math.round(process.uptime());
  const mem = process.memoryUsage();
  const memory = {
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
    rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
  };

  // 2. Business Database & WAL Metrics
  const paths = getBusinessPaths(businessEntry.business.directoryKey);
  const dbFileStat = statSync(paths.database, { throwIfNoEntry: false });
  const walFileStat = statSync(paths.database + "-wal", { throwIfNoEntry: false });
  const shmFileStat = statSync(paths.database + "-shm", { throwIfNoEntry: false });

  const { sqlite: businessSqlite } = openBusinessDatabase(businessEntry.business.directoryKey);

  const pageSize = (businessSqlite.prepare("PRAGMA page_size").get() as { page_size: number } | undefined)?.page_size ?? 4096;
  const pageCount = (businessSqlite.prepare("PRAGMA page_count").get() as { page_count: number } | undefined)?.page_count ?? 0;
  const journalMode = (businessSqlite.prepare("PRAGMA journal_mode").get() as { journal_mode: string } | undefined)?.journal_mode ?? "wal";
  const busyTimeout = (businessSqlite.prepare("PRAGMA busy_timeout").get() as { timeout: number } | undefined)?.timeout ?? 5000;
  const synchronous = (businessSqlite.prepare("PRAGMA synchronous").get() as { synchronous: number } | undefined)?.synchronous ?? 1;
  const foreignKeys = (businessSqlite.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number } | undefined)?.foreign_keys ?? 1;
  const bizTablesRow = businessSqlite.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").get() as { count: number } | undefined;

  const dbSizeBytes = dbFileStat?.size ?? 0;
  const walSizeBytes = walFileStat?.size ?? 0;
  const shmSizeBytes = shmFileStat?.size ?? 0;

  // 3. System Database & WAL Metrics
  const sysDbStat = statSync(SYSTEM_DB_PATH, { throwIfNoEntry: false });
  const sysWalStat = statSync(SYSTEM_DB_PATH + "-wal", { throwIfNoEntry: false });
  const sysSqlite = getSystemSqlite();
  const sysTablesRow = sysSqlite.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").get() as { count: number } | undefined;

  const sysDbSizeBytes = sysDbStat?.size ?? 0;
  const sysWalSizeBytes = sysWalStat?.size ?? 0;

  // 4. Recent Correlated Logs & Traces
  const recentLogs = getRecentLogs({ limit: 50 });

  const healthData: SystemHealthData = {
    businessId,
    uptimeSeconds,
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    memory,
    businessDb: {
      databaseSizeBytes: dbSizeBytes,
      walSizeBytes,
      shmSizeBytes,
      totalSizeBytes: dbSizeBytes + walSizeBytes + shmSizeBytes,
      pageSize,
      pageCount,
      journalMode,
      busyTimeout,
      synchronous,
      foreignKeys,
      tableCount: bizTablesRow?.count ?? 0,
    },
    systemDb: {
      databaseSizeBytes: sysDbSizeBytes,
      walSizeBytes: sysWalSizeBytes,
      totalSizeBytes: sysDbSizeBytes + sysWalSizeBytes,
      tableCount: sysTablesRow?.count ?? 0,
    },
    recentLogs,
  };

  return (
    <SettingsShell
      businessId={businessId}
      title="System Health & Diagnostics"
      description="Live database engine metrics, write-ahead log (WAL) utilization, memory telemetry, and correlated OpenTelemetry/Sentry traces."
    >
      <SystemHealthClient initialData={healthData} />
    </SettingsShell>
  );
}
