import { NextResponse } from "next/server";
import { requireUser } from "@/core/auth/session";
import { importBusinessBackup } from "@/core/businesses/backup-service";

const maximumBackupBytes = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const file = formData.get("backup");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an .erpbackup file." }, { status: 400 });
  }
  if (file.size > maximumBackupBytes) {
    return NextResponse.json(
      { error: "Backup files must be smaller than 50 MB in Phase 0." },
      { status: 413 },
    );
  }

  try {
    const businessId = await importBusinessBackup(await file.arrayBuffer(), user.id);
    return NextResponse.json({ businessId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this backup" },
      { status: 400 },
    );
  }
}
