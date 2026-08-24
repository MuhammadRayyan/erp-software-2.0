const DEVELOPMENT_FALLBACK_SECRET = "phase-zero-development-secret-change-me";

/**
 * True while `next build` compiles/collects page data (module code is imported
 * with NODE_ENV=production, but no server is actually starting). The secret is
 * re-resolved at runtime on every boot, so tolerating the build phase never
 * bakes a fallback into the deployed server.
 */
function isBuildPhase(environment: NodeJS.ProcessEnv) {
  return environment.NEXT_PHASE === "phase-production-build";
}

export function resolveBetterAuthSecret(environment = process.env) {
  const configured = environment.BETTER_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (environment.NODE_ENV === "development") {
    console.warn(
      "[auth] BETTER_AUTH_SECRET is missing; using the development-only fallback secret.",
    );
    return DEVELOPMENT_FALLBACK_SECRET;
  }
  if (isBuildPhase(environment)) {
    console.warn(
      "[auth] BETTER_AUTH_SECRET is not set in the build environment; the build proceeds and the value is re-resolved at server boot.",
    );
    return DEVELOPMENT_FALLBACK_SECRET;
  }
  throw new Error(
    "BETTER_AUTH_SECRET is required when NODE_ENV is not development. Refusing to start.",
  );
}
