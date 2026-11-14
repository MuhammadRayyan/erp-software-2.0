import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { generateWpsSifFile } from "@/modules/payroll/services/wps-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, {
    businessId,
    module: "payroll",
    action: "export",
  });
  if (authError || !session || !access) return authError;

  const url = new URL(request.url);
  const salaryMonth = url.searchParams.get("month") ?? undefined;
  const periodDescription = url.searchParams.get("periodDescription") ?? undefined;
  const payslipIdsParam = url.searchParams.get("payslipIds");
  const payslipIds = payslipIdsParam ? payslipIdsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const employerReference = url.searchParams.get("reference") ?? undefined;
  const preview = url.searchParams.get("preview") === "1";

  const result = generateWpsSifFile(businessId, session.user.id, {
    salaryMonth,
    periodDescription,
    payslipIds,
    employerReference,
  });

  if (preview) {
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  }

  if (!result.valid) {
    return NextResponse.json(
      {
        error: result.errors.map((e) => e.message).join(" "),
        errors: result.errors,
        warnings: result.warnings,
      },
      { status: 400 },
    );
  }

  return new NextResponse(result.sifContent, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
