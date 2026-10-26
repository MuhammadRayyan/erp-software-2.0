import * as Sentry from "@sentry/nextjs";
import { randomBytes } from "node:crypto";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { logger } from "@/core/logger";

export async function emitDiagnosticTrace(businessId: string, userId: string) {
  const access = getBusinessAccess(businessId, userId);
  if (!access?.isSuperAdmin) throw new Error("PERMISSION_DENIED: Only Platform Super-Administrators can trigger diagnostic traces.");
  return Sentry.startSpan({ name: "admin.diagnostic.trace", op: "diagnostic.test" }, async span => {
    const context = span?.spanContext();
    const traceId = context?.traceId ?? randomBytes(16).toString("hex");
    const spanId = context?.spanId ?? randomBytes(8).toString("hex");
    logger.error("Diagnostic test error triggered by admin from System Health dashboard", {
      businessId, userId, traceId, spanId,
      error: new Error("Simulated diagnostic exception for observability verification"),
      metadata: { traceId, spanId, simulated: true },
    });
    return { success: true, traceId, spanId, message: `Diagnostic trace created and logged successfully. Trace ID: ${traceId}` };
  });
}
