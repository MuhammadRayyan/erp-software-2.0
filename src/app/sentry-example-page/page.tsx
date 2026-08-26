import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  Sentry.captureException(new Error("Sentry test error — delete me"));
  throw new Error("Sentry test error — delete me");
}
