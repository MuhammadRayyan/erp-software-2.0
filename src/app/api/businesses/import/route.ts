import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { assertBusinessQuota } from "@/core/businesses/business-service";
import { importBusinessBackupInWorker, importManagerBackupInWorker } from "@/core/workers/jobs";
import { isWorkerBusyError } from "@/core/workers/run-in-worker";

export const runtime = "nodejs";

const maximumBackupBytes = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const { session, error: authError } = await requireApiAuth(request);
  if (authError) return authError;
  const user = session.user;

  try {
    assertBusinessQuota(user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Business limit reached." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("backup");
  const businessNameOverride = formData.get("businessName")?.toString().trim();
  const rawStatus = formData.get("documentStatus")?.toString().trim();
  const documentStatus: "posted" | "draft" = rawStatus === "draft" ? "draft" : "posted";

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
  const isManager = buf.length >= 16 && Buffer.compare(buf.subarray(0, 16), SQLITE_HEADER) === 0;

  // Parsing, integrity checks and the bulk SQLite writes run on a worker
  // thread; the upload's memory is moved (not copied) into it. Imports are not
  // tied to request.signal: they commit in one transaction and an abort half
  // way would leave an empty workspace behind.
  try {
    if (isManager) {
      const result = await importManagerBackupInWorker(buf, user.id, {
        overrideBusinessName: businessNameOverride || undefined,
        documentStatus,
      }, { transfer: true });
      return NextResponse.json({
        businessId: result.businessId,
        businessName: result.businessName,
        source: "manager.io",
        summary: result.summary,
      });
    }

    const businessId = await importBusinessBackupInWorker(buf, user.id, { transfer: true });
    return NextResponse.json({ businessId, source: "uaemanager" });
  } catch (error) {
    if (isWorkerBusyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: { "Retry-After": "30" } });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this backup" },
      { status: 400 },
    );
  }
}
