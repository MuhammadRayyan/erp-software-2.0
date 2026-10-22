import { NextResponse } from "next/server";
import { getSystemSqlite } from "@/core/db/system";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "unknown";
  let dbLatencyMs = 0;

  try {
    const sqlite = getSystemSqlite();
    const queryStart = performance.now();
    sqlite.prepare("SELECT 1 as ping").get();
    dbLatencyMs = Math.round((performance.now() - queryStart) * 100) / 100;
    dbStatus = "connected";
  } catch (error) {
    dbStatus = "error";
    return NextResponse.json(
      {
        status: "error",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        database: {
          status: dbStatus,
          error: error instanceof Error ? error.message : "Database connection failed",
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  }

  const memory = process.memoryUsage();

  return NextResponse.json(
    {
      status: "ok",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      memory: {
        heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      },
      environment: process.env.NODE_ENV ?? "development",
      version: "2.6.0",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}
