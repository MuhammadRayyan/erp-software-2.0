import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e2842b2814fadaa6c5422a6694b0b390@o4511977766191104.ingest.de.sentry.io/4511977771302992",
  tracesSampleRate: 1.0,
});

Sentry.captureException(new Error("Sentry manual verification error - delete me!"));
Sentry.flush(2000).then(() => console.log("Flushed!"));
