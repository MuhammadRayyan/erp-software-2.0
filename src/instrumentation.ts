import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resolveBetterAuthSecret } = await import("@/core/auth/auth-config");
    const { getTrustedOrigins } = await import("@/core/config/app-url");
    resolveBetterAuthSecret();
    getTrustedOrigins();
    await import("./sentry.server.config");
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

