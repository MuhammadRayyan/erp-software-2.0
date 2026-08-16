import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "saxon-js"],
  outputFileTracingIncludes: {
    "/*": ["./src/modules/einvoicing/pint-ae/versions/v1.0.4/validation/*.json"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
