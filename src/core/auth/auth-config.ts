const DEVELOPMENT_FALLBACK_SECRET = "phase-zero-development-secret-change-me";

export function resolveBetterAuthSecret(environment = process.env) {
  const configured = environment.BETTER_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (environment.NODE_ENV === "development") {
    console.warn(
      "[auth] BETTER_AUTH_SECRET is missing; using the development-only fallback secret.",
    );
    return DEVELOPMENT_FALLBACK_SECRET;
  }
  throw new Error(
    "BETTER_AUTH_SECRET is required when NODE_ENV is not development. Refusing to start.",
  );
}
