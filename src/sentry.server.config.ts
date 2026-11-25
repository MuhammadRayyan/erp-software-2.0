import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://e2842b2814fadaa6c5422a6694b0b390@o4511977766191104.ingest.de.sentry.io/4511977771302992",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // Local variable capture would ship customer and financial values from
  // stack frames to a third party; keep it off.
  includeLocalVariables: false,
  sendDefaultPii: false,
  enableLogs: true,
});
