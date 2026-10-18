import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { importBusinessBackup } from "@/core/businesses/backup-service";
import { importManagerBackupToNewBusiness } from "@/modules/migration/manager-importer";

export const runtime = "nodejs";

const maximumBackupBytes = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const { session, error: authError } = await requireApiAuth(request);
  if (authError) return authError;
  const user = session.user;

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

  try {
    if (isManager) {
      const result = importManagerBackupToNewBusiness(buf, user.id, {
        overrideBusinessName: businessNameOverride || undefined,
        documentStatus,
      });
      return NextResponse.json({
        businessId: result.businessId,
        businessName: result.businessName,
        source: "manager.io",
        summary: result.summary,
      });
    }

    const businessId = await importBusinessBackup(arrayBuffer, user.id);
    return NextResponse.json({ businessId, source: "ledgerly" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this backup" },
      { status: 400 },
    );
  }
}
