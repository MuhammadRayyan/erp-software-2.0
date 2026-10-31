"use server";

import { statSync } from "node:fs";
import os from "node:os";
import { requireSuperAdmin } from "@/core/auth/session";
import { getSystemSqlite } from "@/core/db/system";
import { SYSTEM_DB_PATH } from "@/core/db/paths";
import { businesses, users } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import {
  getGlobalEmailConfigStatus,
  verifyGlobalEmailConnection,
  sendGlobalTestEmail,
  type GlobalEmailConfigStatus,
} from "@/modules/email/email-driver";

export type EngineDiagnostics = {
  status: "ok" | "degraded" | "error";
  uptimeSeconds: number;
  timestamp: string;
  database: {
    status: string;
    latencyMs: number;
    journalMode: string;
    pageSize: number;
    busyTimeout: number;
    foreignKeys: number;
    systemDbSizeBytes: number;
    systemWalSizeBytes: number;
    systemShmSizeBytes: number;
    totalSizeBytes: number;
    tableCount: number;
  };
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    externalMb: number;
  };
  processInfo: {
    nodeVersion: string;
    pid: number;
    platform: string;
    arch: string;
    cpuCores: number;
    totalSystemMemoryMb: number;
    freeSystemMemoryMb: number;
    environment: string;
    version: string;
  };
  tenancy: {
    totalBusinesses: number;
    totalTenants: number;
    totalUsers: number;
  };
  emailSystem: GlobalEmailConfigStatus;
};

export async function getEngineDiagnosticsAction(): Promise<EngineDiagnostics> {
  await requireSuperAdmin();

  let dbStatus = "connected";
  let dbLatencyMs = 0;
  let journalMode = "wal";
  let pageSize = 4096;
  let busyTimeout = 5000;
  let foreignKeys = 1;
  let tableCount = 0;

  try {
    const sqlite = getSystemSqlite();
    const queryStart = performance.now();
    sqlite.prepare("SELECT 1 as ping").get();
    dbLatencyMs = Math.round((performance.now() - queryStart) * 100) / 100;

    journalMode = (sqlite.prepare("PRAGMA journal_mode").get() as { journal_mode: string } | undefined)?.journal_mode ?? "wal";
    pageSize = (sqlite.prepare("PRAGMA page_size").get() as { page_size: number } | undefined)?.page_size ?? 4096;
    busyTimeout = (sqlite.prepare("PRAGMA busy_timeout").get() as { timeout: number } | undefined)?.timeout ?? 5000;
    foreignKeys = (sqlite.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number } | undefined)?.foreign_keys ?? 1;
    const tableRow = sqlite.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").get() as { count: number } | undefined;
    tableCount = tableRow?.count ?? 0;
  } catch {
    dbStatus = "error";
  }

  const sysDbStat = statSync(SYSTEM_DB_PATH, { throwIfNoEntry: false });
  const sysWalStat = statSync(SYSTEM_DB_PATH + "-wal", { throwIfNoEntry: false });
  const sysShmStat = statSync(SYSTEM_DB_PATH + "-shm", { throwIfNoEntry: false });

  const systemDbSizeBytes = sysDbStat?.size ?? 0;
  const systemWalSizeBytes = sysWalStat?.size ?? 0;
  const systemShmSizeBytes = sysShmStat?.size ?? 0;
  const totalSizeBytes = systemDbSizeBytes + systemWalSizeBytes + systemShmSizeBytes;

  const mem = process.memoryUsage();
  const db = getSystemDb();

  const totalBusinesses = db.select().from(businesses).all().length;
  const allUsers = db.select().from(users).all();
  const totalTenants = allUsers.filter((u) => u.isTenantAdmin || !u.createdByUserId).length;
  const totalUsers = allUsers.length;

  return {
    status: dbStatus === "connected" ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      journalMode,
      pageSize,
      busyTimeout,
      foreignKeys,
      systemDbSizeBytes,
      systemWalSizeBytes,
      systemShmSizeBytes,
      totalSizeBytes,
      tableCount,
    },
    memory: {
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      externalMb: Math.round((mem.external / 1024 / 1024) * 10) / 10,
    },
    processInfo: {
      nodeVersion: process.version,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      cpuCores: os.cpus().length,
      totalSystemMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
      freeSystemMemoryMb: Math.round(os.freemem() / 1024 / 1024),
      environment: process.env.NODE_ENV ?? "development",
      version: "2.7.0",
    },
    tenancy: {
      totalBusinesses,
      totalTenants,
      totalUsers,
    },
    emailSystem: getGlobalEmailConfigStatus(),
  };
}

export async function testGlobalEmailDeliveryAction(recipientEmail?: string) {
  await requireSuperAdmin();
  if (recipientEmail && recipientEmail.trim()) {
    return sendGlobalTestEmail(recipientEmail);
  }
  return verifyGlobalEmailConnection();
}
