import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import {
  getActiveSpan,
  getCurrentScope,
  generateTraceId,
  generateSpanId,
} from "@sentry/core";
import { desc, eq, and } from "drizzle-orm";
import { getSystemDb } from "@/core/db/system";
import { systemLogs } from "@/core/db/system-schema";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  businessId?: string;
  userId?: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SystemLogRecord = {
  id: string;
  level: LogLevel;
  message: string;
  traceId: string | null;
  spanId: string | null;
  businessId: string | null;
  userId: string | null;
  metadataJson: string | null;
  createdAt: string;
};

/**
 * Extracts active OpenTelemetry / Sentry traceId and spanId from current execution context.
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  try {
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      if (spanContext?.traceId) {
        return {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
        };
      }
    }

    const propContext = getCurrentScope().getPropagationContext();
    if (propContext?.traceId) {
      return {
        traceId: propContext.traceId,
        spanId: (propContext as unknown as { spanId?: string }).spanId,
      };
    }
  } catch {
    // Graceful fallback if Sentry context is unavailable
  }

  try {
    return {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
    };
  } catch {
    return {};
  }
}


function sanitizeMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Error) {
      sanitized[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    } else if (typeof value === "bigint") {
      sanitized[key] = value.toString();
    } else if (typeof value === "function" || typeof value === "symbol") {
      continue;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function persistToSystemLogs(entry: {
  level: LogLevel;
  message: string;
  traceId?: string;
  spanId?: string;
  businessId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): void {
  try {
    const db = getSystemDb();
    db.insert(systemLogs)
      .values({
        id: randomUUID(),
        level: entry.level,
        message: entry.message,
        traceId: entry.traceId ?? null,
        spanId: entry.spanId ?? null,
        businessId: entry.businessId ?? null,
        userId: entry.userId ?? null,
        metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    // Fail silently: logging must never disrupt primary request execution
    console.error("[CorrelatedLogger] Failed to write to system_logs:", err);
  }
}

function normalizeContext(
  contextOrError?: LogContext | Error,
  maybeContext?: LogContext,
): {
  context: LogContext;
  error?: Error;
} {
  let context: LogContext = {};
  let error: Error | undefined;

  if (contextOrError instanceof Error) {
    error = contextOrError;
    context = maybeContext ? { ...maybeContext } : {};
  } else if (contextOrError && typeof contextOrError === "object") {
    context = { ...contextOrError };
    if (context.error instanceof Error) {
      error = context.error;
    }
  }

  return { context, error };
}

function logMessage(
  level: LogLevel,
  message: string,
  contextOrError?: LogContext | Error,
  maybeContext?: LogContext,
) {
  const { context, error } = normalizeContext(contextOrError, maybeContext);
  const trace = getTraceContext();
  const timestamp = new Date().toISOString();

  const businessId = context.businessId;
  const userId = context.userId;

  // Build clean metadata
  const metadata: Record<string, unknown> = {
    ...context.metadata,
  };

  // Add extra top-level context properties that are not reserved keys
  for (const [k, v] of Object.entries(context)) {
    if (!["businessId", "userId", "error", "metadata"].includes(k)) {
      metadata[k] = v;
    }
  }

  if (error) {
    metadata.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const sanitized = sanitizeMetadata(metadata);

  // Structured console log
  const logPayload = {
    timestamp,
    level,
    message,
    traceId: trace.traceId,
    spanId: trace.spanId,
    businessId,
    userId,
    ...(Object.keys(sanitized).length > 0 ? { metadata: sanitized } : {}),
  };

  if (level === "error") {
    console.error(`[ERROR] ${message}`, logPayload);
  } else if (level === "warn") {
    console.warn(`[WARN] ${message}`, logPayload);
  } else if (level === "info") {
    console.info(`[INFO] ${message}`, logPayload);
  } else {
    console.debug(`[DEBUG] ${message}`, logPayload);
  }

  // Mirror error logs to Sentry
  if (level === "error") {
    try {
      const errToCapture = error ?? new Error(message);
      Sentry.withScope((scope) => {
        if (businessId) scope.setTag("businessId", businessId);
        if (userId) scope.setUser({ id: userId });
        if (trace.traceId) scope.setTag("traceId", trace.traceId);
        if (trace.spanId) scope.setTag("spanId", trace.spanId);
        scope.setExtras(sanitized);
        Sentry.captureException(errToCapture);
      });
    } catch {
      // Safe fallback if Sentry is misconfigured or disabled
    }
  }

  // Persist critical logs (error, warn, and any explicit diagnostics) to system_logs table
  if (level === "error" || level === "warn" || level === "info") {
    persistToSystemLogs({
      level,
      message,
      traceId: trace.traceId,
      spanId: trace.spanId,
      businessId,
      userId,
      metadata: Object.keys(sanitized).length > 0 ? sanitized : undefined,
    });
  }
}

export const logger = {
  debug(message: string, context?: LogContext) {
    logMessage("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    logMessage("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    logMessage("warn", message, context);
  },
  error(message: string, contextOrError?: LogContext | Error, maybeContext?: LogContext) {
    logMessage("error", message, contextOrError, maybeContext);
  },
};

/**
 * Retrieves recent logs from system_logs, optionally filtered by businessId and level.
 */
export function getRecentLogs(options?: {
  businessId?: string;
  level?: LogLevel;
  limit?: number;
}): SystemLogRecord[] {
  try {
    const db = getSystemDb();
    const limit = Math.min(options?.limit ?? 50, 200);

    const conditions = [];
    if (options?.businessId) {
      conditions.push(eq(systemLogs.businessId, options.businessId));
    }
    if (options?.level) {
      conditions.push(eq(systemLogs.level, options.level));
    }

    const query = db
      .select()
      .from(systemLogs)
      .orderBy(desc(systemLogs.createdAt))
      .limit(limit);

    if (conditions.length > 0) {
      return query.where(and(...conditions)).all() as SystemLogRecord[];
    }

    return query.all() as SystemLogRecord[];
  } catch (err) {
    console.error("[CorrelatedLogger] Failed to query recent logs:", err);
    return [];
  }
}
