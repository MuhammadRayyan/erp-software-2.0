/**
 * Content Security Policy.
 *
 * Pages get a per-request nonce from `src/proxy.ts`: Next.js reads the nonce
 * from the request's CSP header and adds it to its own scripts, and
 * `'strict-dynamic'` lets those scripts load the app's chunks. No inline
 * script runs without the nonce, so injected markup cannot execute script.
 * Every page is rendered per request (the root layout reads cookies and the
 * session), which nonces require.
 *
 * Non-page responses (API routes, downloads) get the same policy without a
 * nonce; they render no HTML scripts.
 *
 * Styles keep 'unsafe-inline': React `style` attributes cannot carry a nonce,
 * and style injection cannot execute script.
 */
export function buildContentSecurityPolicy({ nonce, isDev }: { nonce?: string; isDev: boolean }) {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`
    : `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    scriptSrc,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    // ws:/wss: are only needed for the development HMR socket.
    `connect-src 'self' https://*.ingest.de.sentry.io https://*.sentry.io${isDev ? " ws: wss:" : ""}`,
    "object-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** 128-bit random nonce, base64 encoded. Works in the proxy (edge-style) runtime. */
export function createCspNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
