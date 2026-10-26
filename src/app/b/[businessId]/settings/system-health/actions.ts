"use server";
import { requirePermission } from "@/core/permissions/require-module";
import { emitDiagnosticTrace } from "@/core/diagnostics/diagnostic-service";
export async function triggerDiagnosticTraceAction(businessId: string) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  return emitDiagnosticTrace(businessId, user.id);
}
