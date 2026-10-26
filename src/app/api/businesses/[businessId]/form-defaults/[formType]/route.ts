export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getFormDefaults, saveFormDefaults } from "@/modules/form-defaults/form-defaults-service";

type Context = { params: Promise<{ businessId: string; formType: string }> };
export async function GET(request: Request, { params }: Context) {
  const { businessId, formType } = await params;
  const auth = await requireApiAuth(request, { businessId, module: "settings" });
  if ("error" in auth) return auth.error;
  return NextResponse.json({ data: getFormDefaults(businessId, auth.session.user.id, formType) });
}
export async function PUT(request: Request, { params }: Context) {
  const { businessId, formType } = await params;
  const auth = await requireApiAuth(request, { businessId, module: "settings", action: "edit" });
  if ("error" in auth) return auth.error;
  try {
    saveFormDefaults(businessId, auth.session.user.id, formType, await request.json());
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Form defaults could not be saved." }, { status: 400 });
  }
}
