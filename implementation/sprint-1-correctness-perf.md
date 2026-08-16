# Sprint 1 — Correctness & Performance

**Goal:** Add request-scoped caching, fix DB connection leaks, add error/loading boundaries, add security hardening, clean up dead code.
**Effort:** ~1 day
**Dependencies:** Sprint 0 complete
**Prerequisite reading:** `implementation/00-overview.md`, `implementation/sprint-0-dev-unblock.md`

---

## Overview

Nine changes, each independently verifiable:

1. **React `cache()`** on hot read paths (F4, F6)
2. **LRU business DB pool** (F5)
3. **Throttle `touchBusiness`** (F7)
4. **Cookie for text size** (F8 — font cookie done in Sprint 0)
5. **Fix non-null assertion** (F10)
6. **Error + loading boundaries** for all route groups (F13)
7. **Login rate-limiting** (F12)
8. **CSP + security headers** (F15)
9. **Dead code cleanup + CI test for middleware** (I8)

---

## Step 1: React `cache()` on hot read paths (F4, F6)

**Problem:** `getBusinessAccess` is called 2–3× per request (BusinessLayout, requireModule, some pages). Chart of accounts, tax codes, currency master are re-queried on every navigation. Zero `cache()` usage in the codebase.

### 1.1 Wrap getBusinessAccess

Open `src/core/permissions/permissions.ts`. Wrap the function with React's `cache()`:

```ts
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { businesses, memberships } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { parseModules, type ModuleKey } from "./module-access";

export { moduleKeys, parseModules, type ModuleKey } from "./module-access";

export const getBusinessAccess = cache((businessId: string, userId: string) => {
  const row = getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(
      memberships,
      and(eq(memberships.businessId, businesses.id), eq(memberships.userId, userId)),
    )
    .where(and(eq(businesses.id, businessId), eq(businesses.archived, false)))
    .get();
  if (!row) return null;
  return { ...row, modules: parseModules(row.membership.role, row.membership.modulesJson) };
});

export function canAccessModule(businessId: string, userId: string, module: ModuleKey) {
  return getBusinessAccess(businessId, userId)?.modules.includes(module) ?? false;
}
```

**Key change:** `export function getBusinessAccess` → `export const getBusinessAccess = cache(...)`. This deduplicates calls within the same React render pass (one DB query per `(businessId, userId)` pair per request).

### 1.2 Wrap getBusinessForUser

Open `src/core/businesses/business-service.ts`. Wrap `getBusinessForUser`:

```ts
import { cache } from "react";
// ... existing imports ...

export const getBusinessForUser = cache((businessId: string, userId: string) => {
  return getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(
      memberships,
      and(eq(memberships.businessId, businesses.id), eq(memberships.userId, userId)),
    )
    .where(eq(businesses.id, businessId))
    .get();
});
```

### 1.3 Wrap other hot reads

Apply the same pattern to these functions (find them in their respective files):

**`src/modules/accounting/services/tax-code-service.ts`:**
```ts
import { cache } from "react";
export const getActiveTaxCodes = cache((businessId: string, userId: string) => {
  // ... existing body ...
});
```

**`src/modules/accounting/services/accounting-settings-service.ts`:**
```ts
import { cache } from "react";
export const getAccountingSettings = cache((businessId: string, userId: string) => {
  // ... existing body ...
});
```

**`src/modules/currency/currency.ts`** (or wherever `getCurrency` / currency master is):
```ts
import { cache } from "react";
export const getCurrencyMaster = cache((businessId: string, userId: string) => {
  // ... existing body ...
});
```

**`src/modules/banking/bank-account-service.ts`:**
```ts
import { cache } from "react";
export const listBankAccounts = cache((businessId: string, userId: string) => {
  // ... existing body ...
});
```

**`src/modules/inventory/inventory-item-service.ts`:**
```ts
import { cache } from "react";
export const listInventoryItemOptions = cache((businessId: string, userId: string) => {
  // ... existing body ...
});
```

**Important:** Read each file first. Only wrap functions that:
- Are pure reads (no writes)
- Take `(businessId, userId)` or similar deterministic args
- Are called multiple times per request

Do NOT wrap functions that write to the DB, or that take no arguments (those should use module-level memoization instead).

### 1.4 Verify
```bash
npm run typecheck
npm run lint
npm run test
npm run dev
```
- Navigate to a business, open Overview, then navigate to Sales Invoices.
- **Expected:** No visible behavior change, but server logs (if any) should show fewer DB queries.
- To verify dedup: temporarily add `console.log("getBusinessAccess called")` inside the cached function, load a page, check the terminal — it should print once per request, not 2–3×.

### 1.5 Commit
```bash
git add -A && git commit -m "sprint-1: add React cache() to hot read paths (F4, F6)"
```

---

## Step 2: LRU business DB pool (F5)

**Problem:** `src/core/db/business.ts` uses a module-level `Map<string, Database.Database>` that never evicts. Long-running processes with many businesses leak file descriptors.

### 2.1 Implement a simple LRU

Open `src/core/db/business.ts`. Replace the connection management:

```ts
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { businesses, memberships } from "./system-schema";
import { getBusinessPaths } from "./paths";
import { getSystemDb } from "./system";
import { migrateBusinessDatabase } from "./business-migrations";
import * as schema from "./business-schema";

const MAX_CONNECTIONS = 32;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes

type Connection = {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle>;
  paths: ReturnType<typeof getBusinessPaths>;
  lastUsed: number;
  idleTimer: ReturnType<typeof setTimeout>;
};

const connections = new Map<string, Connection>();

function closeConnection(directoryKey: string) {
  const conn = connections.get(directoryKey);
  if (!conn) return;
  clearTimeout(conn.idleTimer);
  conn.sqlite.close();
  connections.delete(directoryKey);
}

function scheduleIdleClose(directoryKey: string) {
  const conn = connections.get(directoryKey);
  if (!conn) return;
  clearTimeout(conn.idleTimer);
  conn.idleTimer = setTimeout(() => {
    closeConnection(directoryKey);
  }, IDLE_TIMEOUT_MS);
}

function evictIfNeeded() {
  if (connections.size < MAX_CONNECTIONS) return;
  // Find the least-recently-used connection
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, conn] of connections) {
    if (conn.lastUsed < oldestTime) {
      oldestTime = conn.lastUsed;
      oldestKey = key;
    }
  }
  if (oldestKey) closeConnection(oldestKey);
}

export function openBusinessDatabase(directoryKey: string) {
  let conn = connections.get(directoryKey);
  if (!conn) {
    evictIfNeeded();
    const paths = getBusinessPaths(directoryKey);
    mkdirSync(paths.attachments, { recursive: true });
    const sqlite = new Database(paths.database);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    migrateBusinessDatabase(sqlite, `business database ${directoryKey}`);
    const db = drizzle(sqlite, { schema });
    conn = { sqlite, db, paths, lastUsed: Date.now(), idleTimer: setTimeout(() => {}, 0) };
    connections.set(directoryKey, conn);
  }
  conn.lastUsed = Date.now();
  scheduleIdleClose(directoryKey);
  return { sqlite: conn.sqlite, db: conn.db, paths: conn.paths };
}

export function getBusinessDb(businessId: string, userId: string) {
  const row = getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(
      memberships,
      and(eq(memberships.businessId, businesses.id), eq(memberships.userId, userId)),
    )
    .where(and(eq(businesses.id, businessId), eq(businesses.archived, false)))
    .get();

  if (!row) throw new Error("BUSINESS_ACCESS_DENIED");
  return { ...openBusinessDatabase(row.business.directoryKey), ...row };
}

export function closeBusinessConnection(directoryKey: string) {
  closeConnection(directoryKey);
}

// For testing / graceful shutdown
export function closeAllBusinessConnections() {
  for (const key of [...connections.keys()]) {
    closeConnection(key);
  }
}
```

**Key changes:**
- `MAX_CONNECTIONS = 32` — if exceeded, evict the least-recently-used.
- `IDLE_TIMEOUT_MS = 5 minutes` — connections close after 5 min of no use.
- `scheduleIdleClose` resets the timer on each use.
- Added `WAL` and `foreign_keys = ON` pragmas (were missing for business DBs — the system DB had them).
- Added `closeAllBusinessConnections()` for graceful shutdown.

### 2.2 Verify
```bash
npm run typecheck
npm run lint
npm run test
npm run dev
```
- Navigate between multiple businesses. Switch back and forth.
- **Expected:** No errors. Connections open and close as expected.
- To verify idle timeout: after 5 minutes of inactivity, check that the SQLite file handles are released (on macOS/Linux: `lsof | grep business.sqlite` should show fewer handles).

### 2.3 Commit
```bash
git add -A && git commit -m "sprint-1: LRU + idle-timeout business DB pool (F5)"
```

---

## Step 3: Throttle touchBusiness (F7)

**Problem:** `src/app/b/[businessId]/layout.tsx` calls `touchBusiness(businessId, user.id)` on every navigation, which does a SELECT + UPDATE to update `lastOpenedAt`.

### 3.1 Cookie-based throttle

Open `src/app/b/[businessId]/layout.tsx`:

```tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/core/auth/session";
import { listBusinessesForUser, touchBusiness } from "@/core/businesses/business-service";
import { getBusinessAccess } from "@/core/permissions/permissions";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) notFound();

  // Throttle touchBusiness via cookie — only update if >5 min since last touch
  const cookieStore = await cookies();
  const touchCookie = cookieStore.get(`bt-${businessId}`)?.value;
  const lastTouch = touchCookie ? Number(touchCookie) : 0;
  if (Date.now() - lastTouch > TOUCH_INTERVAL_MS) {
    touchBusiness(businessId, user.id);
    cookieStore.set(`bt-${businessId}`, String(Date.now()), {
      maxAge: 60 * 60 * 24 * 30,  // 30 days
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  const businessList = listBusinessesForUser(user.id).map(({ business }) => ({ id: business.id, name: business.name }));
  return (
    <AppShell business={{ id: access.business.id, name: access.business.name }} businesses={businessList} modules={access.modules} user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
```

### 3.2 Verify
```bash
npm run typecheck
npm run lint
npm run dev
```
- Navigate within a business — `lastOpenedAt` should NOT update on every navigation.
- Wait 5+ minutes, navigate again — `lastOpenedAt` should update once, then not again for 5 more minutes.
- Check cookies: `bt-{businessId}` should be set.

### 3.3 Commit
```bash
git add -A && git commit -m "sprint-1: throttle touchBusiness via cookie (F7)"
```

---

## Step 4: Fix non-null assertion (F10)

**Problem:** `src/app/b/[businessId]/overview/page.tsx` line 16 uses `getBusinessForUser(businessId, user.id)!` — crashes if the business is archived between the layout check and the page render.

### 4.1 Replace with notFound()

Open `src/app/b/[businessId]/overview/page.tsx`:

```tsx
// Before:
const access = getBusinessForUser(businessId, user.id)!;

// After:
import { notFound } from "next/navigation";
const access = getBusinessForUser(businessId, user.id);
if (!access) notFound();
```

### 4.2 Search for other non-null assertions on access/business

```bash
rg "getBusinessForUser.*!" src/
rg "getBusinessAccess.*!" src/
```

Fix any other instances with the same `if (!x) notFound()` pattern.

### 4.3 Verify
```bash
npm run typecheck
npm run lint
npm run dev
```
- Visit Overview page — should render normally.
- Try visiting a business you don't have access to (manually craft the URL) — should show 404, not crash.

### 4.4 Commit
```bash
git add -A && git commit -m "sprint-1: fix non-null assertion crash risk in Overview (F10)"
```

---

## Step 5: Error + loading boundaries (F13)

**Problem:** Only 2 `error.tsx` and 2 `loading.tsx` files exist for 110 route segments. A runtime error crashes the whole app shell.

### 5.1 Create route-group-level boundaries

Create these files (each is a simple boundary). The existing `src/app/b/[businessId]/error.tsx` and `loading.tsx` already exist — create ones for the sub-route groups.

**`src/app/b/[businessId]/sales/error.tsx`:**
```tsx
"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SalesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page-container">
      <div className="max-w-xl rounded-lg border border-danger/25 bg-surface-raised p-6">
        <AlertTriangle className="size-6 text-danger" />
        <h1 className="mt-4 text-lg font-semibold">Sales section error</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Something went wrong loading this sales page. Your data was not changed.
        </p>
        <Button className="mt-5" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
```

**`src/app/b/[businessId]/sales/loading.tsx`:**
```tsx
import { LoaderCircle } from "lucide-react";

export default function SalesLoading() {
  return (
    <div className="page-container">
      <div className="flex items-center gap-3 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        <span>Loading sales…</span>
      </div>
    </div>
  );
}
```

### 5.2 Create for all major route groups

Repeat the above pattern for each route group. Create `error.tsx` + `loading.tsx` in each:

```
src/app/b/[businessId]/sales/error.tsx          ✅
src/app/b/[businessId]/sales/loading.tsx         ✅
src/app/b/[businessId]/purchases/error.tsx
src/app/b/[businessId]/purchases/loading.tsx
src/app/b/[businessId]/banking/error.tsx
src/app/b/[businessId]/banking/loading.tsx
src/app/b/[businessId]/inventory/error.tsx
src/app/b/[businessId]/inventory/loading.tsx
src/app/b/[businessId]/accounting/error.tsx
src/app/b/[businessId]/accounting/loading.tsx
src/app/b/[businessId]/reports/error.tsx
src/app/b/[businessId]/reports/loading.tsx
src/app/b/[businessId]/tax/error.tsx
src/app/b/[businessId]/tax/loading.tsx
src/app/b/[businessId]/projects/error.tsx
src/app/b/[businessId]/projects/loading.tsx
src/app/b/[businessId]/settings/error.tsx
src/app/b/[businessId]/settings/loading.tsx
src/app/b/[businessId]/customers/error.tsx
src/app/b/[businessId]/customers/loading.tsx
src/app/b/[businessId]/suppliers/error.tsx
src/app/b/[businessId]/suppliers/loading.tsx
```

Customize the message per group (e.g., "Banking section error", "Loading reports…"). Keep the structure identical for consistency.

### 5.3 Verify
```bash
npm run typecheck
npm run lint
npm run dev
```
- Navigate to each section. Loading states should flash briefly.
- To test error boundary: temporarily add `throw new Error("test")` to a page, visit it, confirm the error UI shows instead of a blank screen. Remove the throw after testing.

### 5.4 Commit
```bash
git add -A && git commit -m "sprint-1: add error/loading boundaries to all route groups (F13)"
```

---

## Step 6: Login rate-limiting (F12)

**Problem:** No rate-limiting on login. Brute-force vulnerable.

**Important:** Next.js middleware runs on the Edge Runtime and **cannot** use in-memory `Map` persistence or `setInterval`. Rate-limiting must happen in an API route (Node runtime). **Do not touch `src/middleware.ts`** — it stays as the Edge-safe cookie check from Sprint 0.

### 6.1 Create the rate limiter (Node runtime only)

Create `src/core/auth/rate-limiter.ts`:

```ts
// IMPORTANT: This module uses in-memory state and setInterval.
// It MUST only be imported by API routes (Node runtime), NEVER by middleware (Edge runtime).

const WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const MAX_ATTEMPTS = 5;

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export function checkRateLimit(request: Request): { allowed: boolean; remaining: number; resetAt: number } {
  const ip = getClientIp(request);
  const now = Date.now();
  let attempt = attempts.get(ip);

  if (!attempt || now > attempt.resetAt) {
    attempt = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, attempt);
  }

  if (attempt.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: attempt.resetAt };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - attempt.count, resetAt: attempt.resetAt };
}

export function recordFailedAttempt(request: Request) {
  const ip = getClientIp(request);
  const now = Date.now();
  let attempt = attempts.get(ip);

  if (!attempt || now > attempt.resetAt) {
    attempt = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, attempt);
  }

  attempt.count += 1;
}

export function clearAttempts(request: Request) {
  const ip = getClientIp(request);
  attempts.delete(ip);
}

// Periodic cleanup of expired entries (every 5 minutes)
// Safe here because this module only loads in the Node runtime (API routes).
setInterval(() => {
  const now = Date.now();
  for (const [ip, attempt] of attempts) {
    if (now > attempt.resetAt) attempts.delete(ip);
  }
}, 5 * 60 * 1000);
```

### 6.2 Create the rate-limit API route (Node runtime)

Create `src/app/api/auth-rate-limit/route.ts`:

```ts
import { NextResponse } from "next/server";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/core/auth/rate-limiter";

export const runtime = "nodejs";  // Force Node runtime — rate-limiter uses in-memory Map + setInterval

export async function POST(request: Request) {
  const status = checkRateLimit(request);
  if (!status.allowed) {
    const retryAfter = Math.ceil((status.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  return NextResponse.json({ remaining: status.remaining });
}

export async function PUT(request: Request) {
  recordFailedAttempt(request);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  clearAttempts(request);
  return NextResponse.json({ ok: true });
}
```

### 6.3 Update login-form.tsx with pre-flight rate-limit check

Open `src/app/(auth)/login/login-form.tsx`. Update the `submit` function:

```tsx
async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setPending(true);
  setError("");
  const form = new FormData(event.currentTarget);

  // Pre-flight rate-limit check
  try {
    const checkResponse = await fetch("/api/auth-rate-limit", { method: "POST" });
    if (checkResponse.status === 429) {
      const data = await checkResponse.json();
      setError(data.error ?? "Too many attempts. Try again later.");
      setPending(false);
      return;
    }
  } catch {
    // Network error — proceed with login attempt anyway
  }

  const result = await authClient.signIn.email({
    email: String(form.get("email")),
    password: String(form.get("password")),
  });

  if (result.error) {
    // Record failed attempt
    await fetch("/api/auth-rate-limit", { method: "PUT" });
    setError(result.error.message ?? "Sign in failed. Check your details and try again.");
    setPending(false);
    return;
  }

  // Success — clear attempts
  await fetch("/api/auth-rate-limit", { method: "DELETE" });
  router.replace("/businesses");
  router.refresh();
}
```

### 6.4 Do NOT modify middleware

`src/middleware.ts` stays exactly as it is from Sprint 0 — Edge-safe, cookie check only. Rate-limiting happens entirely through the API route + login form, not in middleware.

### 6.5 Verify
```bash
npm run typecheck
npm run lint
npm run dev
```
- Try logging in with wrong password 6 times rapidly.
- **Expected:** After 5 failures, the 6th attempt returns "Too many login attempts" for 15 minutes.
- Log in successfully — attempts should clear.

### 6.6 Commit
```bash
git add -A && git commit -m "sprint-1: add login rate-limiting via API route (F12)"
```

---

## Step 7: CSP + security headers (F15)

**Problem:** No CSP, no security headers.

### 7.1 Add headers to next.config.ts

Open `next.config.ts`:

```ts
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
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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

export default nextConfig;
```

**Note on CSP:** `'unsafe-inline'` and `'unsafe-eval'` are needed for Next.js dev mode and inline styles. In production, consider using nonces for stricter CSP. The `style-src` includes `fonts.googleapis.com` as a fallback (shouldn't be needed after Sprint 0 self-hosting, but keeps things working if any font fetch leaks through).

### 7.2 Verify
```bash
npm run dev
```
- Open browser DevTools → Network tab → click any request → check Response Headers.
- **Expected:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: ...` present.
- No console errors about CSP blocking anything.

### 7.3 Commit
```bash
git add -A && git commit -m "sprint-1: add CSP and security headers (F15)"
```

---

## Step 8: Dead code cleanup + CI test (I8)

### 8.1 Delete dead code

**Delete `src/components/later-page.tsx`:**
```bash
rm src/components/later-page.tsx
```
Verify nothing imports it:
```bash
rg "later-page|LaterPage" src/
# Should return 0 results
```

### 8.2 Update "Phase 0" copy

Search for user-visible "Phase 0" references:
```bash
rg "Phase 0|phase 0|phase-zero" src/ --type ts --type tsx
```

Update each to remove the phase reference. Examples:
- `"Phase 0 proof of concept using pdfme's movable schema editor"` → `"Invoice template editor"` (will be fully replaced in Sprint 2)
- `"Phase 0 does not send invitations."` → `"Invitation emails are not available. Add existing local users by email."`
- `"Backup files must be smaller than 50 MB in Phase 0."` → `"Backup files must be smaller than 50 MB."`
- `"Phase 0 assigns an account that already exists..."` → `"Add an existing local user by email. Invitation emails are not available."`

### 8.3 Remove disabled placeholders (optional)

If you want to clean up the nav:
- Remove the "Command search" button from `src/components/app-shell/app-shell.tsx` (will be re-added properly in a later sprint with `cmdk`).
- Remove the "Help" button.
- Remove "Duplicate (later)" from `src/app/businesses/business-list.tsx`.

Or leave them if you prefer to implement them later. This is a judgment call.

### 8.4 Add CI test for middleware existence (I8)

Create `tests/middleware-exists.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("src/middleware.ts exists and exports middleware", async () => {
  const middlewarePath = path.join(process.cwd(), "src", "middleware.ts");
  assert.ok(existsSync(middlewarePath), "src/middleware.ts must exist (F1 regression guard)");

  const content = await readFile(middlewarePath, "utf8");
  assert.ok(
    /export\s+async\s+function\s+middleware\b/.test(content) ||
    /export\s+const\s+middleware\s*=/.test(content),
    "src/middleware.ts must export a function named 'middleware'"
  );
  assert.ok(
    /export\s+const\s+config\s*=/.test(content),
    "src/middleware.ts must export a config object with matcher"
  );
});
```

Add it to the test script in `package.json`:
```jsonc
"test": "npm run tests/middleware-exists.test.ts && npm run tests/pre-phase-5.test.ts && ..."
```

### 8.5 Verify
```bash
npm run typecheck
npm run lint
npm run test    # all tests pass including the new middleware test
npm run dev
```

### 8.6 Commit
```bash
git add -A && git commit -m "sprint-1: dead code cleanup, update phase-0 copy, middleware CI test (I8)"
```

---

## Step 9: Final verification

### 9.1 Full checklist
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run db:check` passes
- [ ] `npm run test` passes (all 82 + 1 new middleware test)
- [ ] Navigation feels faster (cache() dedup)
- [ ] Error pages show when a route crashes (test with temporary `throw new Error`)
- [ ] Loading skeletons show during navigation
- [ ] Login rate-limiting works (5 failed attempts → 429)
- [ ] Security headers present in DevTools
- [ ] No "Phase 0" references in user-visible strings
- [ ] `later-page.tsx` deleted

### 9.2 Final commit
```bash
git add -A && git commit -m "sprint-1: complete - correctness and performance improvements"
```

---

## What's next

Sprint 1 is complete. The app is now correct, performant, and secure. Move to `sprint-2-pdf-engine.md` for:
- Replace pdfme with `@react-pdf/renderer` + HTML template support
- Build settings page with live preview
- Migrate existing templates
