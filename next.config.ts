import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";
import { withSentryConfig } from "@sentry/nextjs/config";
import { buildContentSecurityPolicy } from "./src/core/security/csp";

function extractOriginHostname(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const hostPort = trimmed.replace(/^https?:\/\//i, "").split("/")[0]?.trim();
  if (!hostPort) return null;
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end !== -1 ? hostPort.slice(0, end + 1) : hostPort;
  }
  return hostPort.split(":")[0] || null;
}

const envDevOrigins = [
  process.env.APP_DOMAIN,
  process.env.BETTER_AUTH_URL,
  ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",") ?? []),
]
  .map(extractOriginHostname)
  .filter((entry): entry is string => Boolean(entry));

const nextConfig: NextConfig = {
  // Allow localhost, Tailscale MagicDNS (*.ts.net), and configured dev origins for dev server & HMR
  allowedDevOrigins: [
    ...new Set([
      "localhost",
      "127.0.0.1",
      "**.ts.net",
      ...envDevOrigins,
    ]),
  ],
  // Standalone output for container deployment (server.js + traced node_modules).
  output: "standalone",
  // Caddy owns gzip/zstd compression in production.
  compress: false,
  deploymentId: process.env.APP_REVISION,
  // Keep manifest paths distinct when old hashed assets are retained across releases.
  generateBuildId: async () => process.env.APP_REVISION ?? randomUUID(),
  // Allows validation builds to target a separate directory (NEXT_DIST_DIR=.next-validate)
  // so they never clobber the running dev server's .next output or base tsconfig.json.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  ...(process.env.NEXT_DIST_DIR === ".next-validate"
    ? { typescript: { tsconfigPath: "tsconfig.validate.json" } }
    : {}),
  serverExternalPackages: ["better-sqlite3", "puppeteer-core", "yazl"],
  // Worker-thread bundles (scripts/build-workers.mjs, run by `npm run build`)
  // are loaded by path at runtime, so tracing cannot see them. better-sqlite3
  // and puppeteer-core, which they require, are already traced as externals.
  outputFileTracingIncludes: {
    "/api/businesses/**/*": ["./dist-workers/*.cjs"],
  },
  experimental: {
    cpus: 2,
    serverActions: {
      bodySizeLimit: "1mb",
    },
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Pages get a per-request nonce CSP from src/proxy.ts. Routes the proxy
        // does not run on (API, monitoring tunnel) get the nonce-less policy.
        source: "/(api|monitoring)/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy({ isDev: process.env.NODE_ENV !== "production" }),
          },
        ],
      },
    ];
  },
};


export default withSentryConfig(nextConfig, {
  org: "personal-bv0",
  project: "erp-20",
  authToken: process.env.SENTRY_AUTH_TOKEN, // from CI env or a gitignored .env
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  // Disable webpack tree-shaking options if using Turbopack, or just omit them as per Next 15+
});

