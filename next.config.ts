import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "saxon-js"],
  outputFileTracingIncludes: {
    "/*": ["./src/modules/einvoicing/pint-ae/versions/v1.0.4/validation/*.json"],
  },
  experimental: {
    webpackMemoryOptimizations: true,
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
