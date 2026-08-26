import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Standalone output for container deployment (server.js + traced node_modules).
  output: "standalone",
  // Allows validation builds to target a separate directory (NEXT_DIST_DIR=.next-validate)
  // so they never clobber the running dev server's .next output.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  serverExternalPackages: ["better-sqlite3", "saxon-js", "puppeteer"],
  outputFileTracingIncludes: {
    "/*": ["./src/modules/einvoicing/pint-ae/versions/v1.0.4/validation/*.json"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
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

