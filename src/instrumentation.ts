import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resolveBetterAuthSecret } = await import("@/core/auth/auth-config");
    const { getTrustedOrigins } = await import("@/core/config/app-url");
    resolveBetterAuthSecret();
    getTrustedOrigins();
    await import("./sentry.server.config");

    const { cleanStaleScratch } = await import("@/core/db/paths");
    cleanStaleScratch();
    const { startMemoryMonitor } = await import("@/core/memory-monitor");
    const { logger } = await import("@/core/logger");
    startMemoryMonitor((message, metadata) => {
      logger.warn(message, { metadata });
      Sentry.captureMessage(message, { level: "warning", extra: metadata });
    });

    // Loading puppeteer-core blocks the event loop for ~0.5 s. Do it once shortly
    // after startup instead of during the first custom-template PDF request.
    if (process.env.NODE_ENV === "production") {
      setTimeout(() => void import("puppeteer-core").catch(() => undefined), 5_000).unref();
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = async (err, request, context) => {
  // Capture unhandled error in Sentry
  await Sentry.captureRequestError(err, request, context);

  // Extract businessId from URL path if present (e.g. /b/<businessId>/...)
  const pathMatch = typeof request.path === "string" ? request.path.match(/\/b\/([^/]+)/) : null;
  const businessId = pathMatch ? pathMatch[1] : undefined;

  // Mirror correlated error to local system_logs and structured console in non-edge runtimes
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { logger } = await import("@/core/logger");
    logger.error(
      `Unhandled error in ${context.routeType} (${context.routePath}): ${err instanceof Error ? err.message : String(err)}`,
      {
        businessId,
        error: err,
        metadata: {
          path: request.path,
          method: request.method,
          routePath: context.routePath,
          routeType: context.routeType,
          routerKind: context.routerKind,
          renderSource: (context as { renderSource?: string }).renderSource,
          digest: (err as { digest?: string })?.digest,
        },
      },
    );
  }
};

