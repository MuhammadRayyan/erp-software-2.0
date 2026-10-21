# Deployment & Containerization Invariants

When modifying Docker configurations, build scripts, or deployment pipelines for Modern ERP, strictly enforce the following architectural rules:

## 1. Node.js & Native C++ Binary ABI Compatibility
- **Runtime Version**: Production Docker images must use `node:22-bookworm-slim` (or higher Node 22+ Debian slim).
- **Rationale**: `better-sqlite3: 13.x` and `kysely: 0.29.x` require Node 22+ N-API ABI. Building with Node 20 triggers `SIGSEGV` during Next.js static page collection.
- **Dependency Resolution**: `.npmrc` must include `legacy-peer-deps=true` to resolve peer dependency mismatches with `better-auth`.
- **Build Stage DevDependencies**: Next.js 16 build with Turbopack requires `@tailwindcss/postcss` and `typescript`. Never omit devDependencies in the builder stage (use `npm ci --include=dev`).

## 2. Next.js Standalone Networking & Healthchecks
- **Explicit Host Binding**: Always set `ENV HOSTNAME="0.0.0.0"` in `Dockerfile` and `docker-compose.yml`.
- **Rationale**: Docker sets the `HOSTNAME` environment variable to the container ID by default. Without an explicit `0.0.0.0` override, Next.js binds solely to `eth0`, causing internal Docker healthchecks (`curl http://localhost:3000/api/health`) to fail with connection refused.

## 3. Persistent Multi-Tenant Storage Protection
- **Storage Path**: The container's `/app/data` volume must always map to the host's `/opt/modern-erp/data`.
- **Data Safety**: All central SQLite databases (`system.db`) and tenant databases (`data/businesses/*.db`) must reside in this directory. Never introduce configurations that store database files in ephemeral container layers.
- **Migration Protocol**: All database migrations must remain forward-compatible and idempotently execute on application startup via `migrate-runner.ts`.

## 4. Headless Chromium for PDF Generation
- **Runner Libraries**: The production runner image must install `chromium`, `ca-certificates`, and `fonts-liberation`.
- **Environment Flags**: `PUPPETEER_SKIP_DOWNLOAD=true` and `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` must be present.
