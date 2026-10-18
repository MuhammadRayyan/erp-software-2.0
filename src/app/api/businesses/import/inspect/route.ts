import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { inspectManagerBackup } from "@/modules/migration/manager-importer";
import JSZip from "jszip";

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

  if (buf.length >= 16 && Buffer.compare(buf.subarray(0, 16), SQLITE_HEADER) === 0) {
    try {
      const summary = inspectManagerBackup(buf);
      return NextResponse.json({
        type: "manager",
        summary,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid Manager.io backup file." },
        { status: 400 },
      );
    }
  }

  // Check if it's a native .erpbackup (ZIP)
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) {
      return NextResponse.json({ error: "Missing manifest.json in backup." }, { status: 400 });
    }
    const manifest = JSON.parse(await manifestFile.async("string"));
    return NextResponse.json({
      type: "ledgerly",
      manifest,
    });
  } catch {
    return NextResponse.json(
      { error: "Unrecognized backup file format. Expected a .erpbackup (ZIP) or .manager (SQLite 3) file." },
      { status: 400 },
    );
  }
}
