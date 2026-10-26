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
  if (process.env.APP_DOMAIN?.trim()) {
    const domain = sanitizeDomain(process.env.APP_DOMAIN);
    const proto = getAppProtocol(domain);
    return `${proto}//${domain}`;
  }
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

/** Request Origin/Host headers never grant trust. Configure each deployment explicitly. */
export function getTrustedOrigins(_request?: Request): string[] {
  void _request;
  const configured = [getAppBaseUrl(), ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [])];
  if (process.env.NODE_ENV !== "production") configured.push("http://localhost:3000", "http://127.0.0.1:3000");
  return [...new Set(configured.filter((value) => value.trim()).map((value) => {
    const url = new URL(value.trim());
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol) ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !loopback)) {
      throw new Error("Trusted origins must be explicit HTTPS origins in production.");
    }
    return url.origin;
  }))];
}
