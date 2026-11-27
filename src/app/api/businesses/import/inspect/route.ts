import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { inspectBackupArchiveInWorker, inspectManagerBackupInWorker } from "@/core/workers/jobs";
import { isWorkerBusyError } from "@/core/workers/run-in-worker";

export const runtime = "nodejs";

const maximumBackupBytes = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const { error: authError } = await requireApiAuth(request);
  if (authError) return authError;

  const formData = await request.formData();
  const file = formData.get("backup");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an .erpbackup or .manager file." }, { status: 400 });
  }
  if (file.size > maximumBackupBytes) {
    return NextResponse.json(
      { error: "Backup files must be smaller than 50 MB." },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");

  // Parsing runs on a worker thread; the upload's memory is moved into it.
  if (buf.length >= 16 && Buffer.compare(buf.subarray(0, 16), SQLITE_HEADER) === 0) {
    try {
      const summary = await inspectManagerBackupInWorker(buf, { transfer: true, signal: request.signal });
      return NextResponse.json({
        type: "manager",
        summary,
      });
    } catch (err) {
      if (isWorkerBusyError(err)) return NextResponse.json({ error: err.message }, { status: 503, headers: { "Retry-After": "30" } });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid Manager.io backup file." },
        { status: 400 },
      );
    }
  }

  // Check if it's a native .erpbackup (ZIP)
  try {
    const manifest = await inspectBackupArchiveInWorker(buf, { transfer: true, signal: request.signal });
    return NextResponse.json({
      type: "uaemanager",
      manifest,
    });
  } catch (err) {
    if (isWorkerBusyError(err)) return NextResponse.json({ error: err.message }, { status: 503, headers: { "Retry-After": "30" } });
    if (err instanceof Error && err.message === "Missing manifest.json in backup.") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Unrecognized backup file format. Expected a .erpbackup (ZIP) or .manager (SQLite 3) file." },
      { status: 400 },
    );
  }
}
