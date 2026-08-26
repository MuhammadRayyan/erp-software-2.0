import os

filepath = "next.config.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("import type { NextConfig } from \"next\";", "import type { NextConfig } from \"next\";\nimport { withSentryConfig } from \"@sentry/nextjs\";")

c = c.replace("export default nextConfig;", """
export default withSentryConfig(nextConfig, {
  org: "personal-bv0",
  project: "erp-20",
  authToken: process.env.SENTRY_AUTH_TOKEN, // from CI env or a gitignored .env
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  // Disable webpack tree-shaking options if using Turbopack, or just omit them as per Next 15+
});
""")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
