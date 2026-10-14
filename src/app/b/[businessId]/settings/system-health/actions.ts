"use server";

import * as Sentry from "@sentry/nextjs";
import { requireModule } from "@/core/permissions/require-module";
import { logger } from "@/core/logger";

export async function emitDiagnosticTrace(
  businessId: string,
  user: { id: string; name: string; email: string },
) {
  return Sentry.startSpan(
    {
      name: "admin.diagnostic.trace",
      op: "diagnostic.test",
    },
    async (span) => {
      const spanContext = span?.spanContext();
      const traceId = spanContext?.traceId;
      const spanId = spanContext?.spanId;

      logger.error(
        `Diagnostic test error triggered by admin (${user.name}) from System Health dashboard`,
        {
          businessId,
          userId: user.id,
          error: new Error(`Simulated diagnostic exception for observability verification [trace: ${traceId}]`),
          metadata: {
            triggeredBy: user.name,
            userEmail: user.email,
            traceId,
            spanId,
            timestamp: new Date().toISOString(),
            simulated: true,
          },
        },
      );

      return {
        success: true,
        traceId,
        spanId,
        message: `Diagnostic trace created and logged successfully. Trace ID: ${traceId}`,
      };
    },
  );
}

export async function triggerDiagnosticTraceAction(businessId: string) {
  const { user } = await requireModule(businessId, "settings");
  return emitDiagnosticTrace(businessId, user);
}

