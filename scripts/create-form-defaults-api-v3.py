import os

api_dir = "src/app/api/businesses/[businessId]/form-defaults/[formType]"

content = """import { NextResponse } from "next/server";
import { getBusinessDb } from "@/core/db/business";
import { formDefaults } from "@/core/db/business-schema";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string; formType: string }> }
) {
  try {
    const { businessId, formType } = await params;
    const user = await requireUser();
    const access = getBusinessForUser(businessId, user.id);
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { db } = getBusinessDb(businessId, user.id);
    const existing = db.select().from(formDefaults).where(eq(formDefaults.formType, formType)).get();
    
    return NextResponse.json({ data: existing ? JSON.parse(existing.payloadJson) : null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ businessId: string; formType: string }> }
) {
  try {
    const { businessId, formType } = await params;
    const user = await requireUser();
    const access = getBusinessForUser(businessId, user.id);
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const payloadJson = JSON.stringify(body);

    const { db } = getBusinessDb(businessId, user.id);
    const existing = db.select().from(formDefaults).where(eq(formDefaults.formType, formType)).get();

    if (existing) {
      db.update(formDefaults)
        .set({ payloadJson, updatedAt: new Date().toISOString() })
        .where(eq(formDefaults.id, existing.id))
        .run();
    } else {
      db.insert(formDefaults)
        .values({
          id: randomUUID(),
          formType,
          payloadJson,
          updatedAt: new Date().toISOString(),
        })
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
"""

with open(f"{api_dir}/route.ts", "w", encoding="utf-8") as f:
    f.write(content)

print("done")
