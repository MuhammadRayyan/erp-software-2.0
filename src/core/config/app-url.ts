/**
 * Unified Application Domain & URL Configuration
 * Single source of truth across development and production environments.
 */

export function sanitizeDomain(raw?: string | null): string {
  if (!raw?.trim()) return "localhost:3000";
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

export function getAppDomain(): string {
  if (process.env.APP_DOMAIN) {
    return sanitizeDomain(process.env.APP_DOMAIN);
  }
  if (process.env.BETTER_AUTH_URL) {
    return sanitizeDomain(process.env.BETTER_AUTH_URL);
  }
  if (process.env.APP_URL) {
    return sanitizeDomain(process.env.APP_URL);
  }
  return process.env.NODE_ENV === "production"
    ? "erp-portal.rapidtss.com"
    : "localhost:3000";
}

export function getAppProtocol(domain: string = getAppDomain()): "http:" | "https:" {
  if (process.env.APP_PROTOCOL) {
    return process.env.APP_PROTOCOL.startsWith("https") ? "https:" : "http:";
  }
  const isLocal =
    domain.startsWith("localhost") ||
    domain.startsWith("127.0.0.1") ||
    domain.startsWith("0.0.0.0");
  return isLocal ? "http:" : "https:";
}

export function getAppBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL?.trim()) {
    return process.env.BETTER_AUTH_URL.trim().replace(/\/+$/, "");
  }
  if (process.env.APP_URL?.trim()) {
    return process.env.APP_URL.trim().replace(/\/+$/, "");
  }
  const domain = getAppDomain();
  const proto = getAppProtocol(domain);
  return `${proto}//${domain}`;
}

export function getTrustedOrigins(request?: Request): string[] {
  const origins = new Set<string>();

  // Always allow local development ports
  origins.add("http://localhost:3000");
  origins.add("http://localhost");
  origins.add("http://127.0.0.1:3000");
  origins.add("http://127.0.0.1");

  // Configured base URL and domain
  const baseUrl = getAppBaseUrl();
  origins.add(baseUrl);

  const domain = getAppDomain();
  origins.add(`https://${domain}`);
  origins.add(`http://${domain}`);

  // Production Oracle VM direct IP access (for resilience and direct curl probes)
  origins.add("http://84.235.255.173");
  origins.add("https://84.235.255.173");

  // Dynamic request headers from reverse proxy (Caddy)
  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    if (forwardedHost) {
      origins.add(`${forwardedProto}://${forwardedHost}`);
      origins.add(`http://${forwardedHost}`);
      origins.add(`https://${forwardedHost}`);
    }
    const originHeader = request.headers.get("origin");
    if (originHeader) {
      origins.add(originHeader);
    }
  }

  // Explicit env var overrides
  if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
    for (const part of process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")) {
      const trimmed = part.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  return Array.from(origins);
}
