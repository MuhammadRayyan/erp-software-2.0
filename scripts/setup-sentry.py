import os

os.makedirs("src", exist_ok=True)

# 1. instrumentation-client.ts
client_content = """import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://e2842b2814fadaa6c5422a6694b0b390@o4511977766191104.ingest.de.sentry.io/4511977771302992",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  integrations: [
    Sentry.replayIntegration(),
  ],
});
"""
with open("src/instrumentation-client.ts", "w", encoding="utf-8") as f:
    f.write(client_content)

# 2. sentry.server.config.ts
server_content = """import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://e2842b2814fadaa6c5422a6694b0b390@o4511977766191104.ingest.de.sentry.io/4511977771302992",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  includeLocalVariables: true,
  enableLogs: true,
});
"""
with open("src/sentry.server.config.ts", "w", encoding="utf-8") as f:
    f.write(server_content)

# 3. sentry.edge.config.ts
edge_content = """import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://e2842b2814fadaa6c5422a6694b0b390@o4511977766191104.ingest.de.sentry.io/4511977771302992",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  enableLogs: true,
});
"""
with open("src/sentry.edge.config.ts", "w", encoding="utf-8") as f:
    f.write(edge_content)

# 4. instrumentation.ts
instr_content = """import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
"""
with open("src/instrumentation.ts", "w", encoding="utf-8") as f:
    f.write(instr_content)

# 5. global-error.tsx
os.makedirs("src/app", exist_ok=True)
global_error_content = '''"use client";

import * as Sentry from "@sentry/nextjs";
import Error from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <Error statusCode={500} />
      </body>
    </html>
  );
}
'''
with open("src/app/global-error.tsx", "w", encoding="utf-8") as f:
    f.write(global_error_content)

print("done")
