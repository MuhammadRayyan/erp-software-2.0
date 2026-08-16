# Sprint 0 — Dev Unblock

**Goal:** Transform the dev loop from slow to instant, fix a critical security bug, and gate demo credentials.
**Effort:** ~1.5 hours
**Dependencies:** None
**Prerequisite reading:** `implementation/00-overview.md`

---

## Overview

Five changes, each independently verifiable:

1. **Fix dead middleware** (F1) — rename `src/proxy.ts` → `src/middleware.ts`
2. **Switch to Bun** (runtime + package manager)
3. **Re-enable Turbopack** (remove `--webpack` and webpack band-aids)
4. **Self-host fonts** (download WOFF2, cookie-based selection, no DB query)
5. **Gate demo credentials** (F11) — only pre-fill in development

---

## Step 1: Fix dead middleware (F1)

**Problem:** `src/proxy.ts` exports `proxy` but Next.js only recognizes `src/middleware.ts` exporting `middleware`. The edge auth/module check is silently non-functional.

**Important architectural constraint:** Next.js Middleware runs on the **Edge Runtime**, which cannot use Node.js native modules (`better-sqlite3`, `drizzle`, etc.). The original `proxy.ts` imported `canAccessModule` and `auth.api.getSession()` — both query SQLite and will crash on the Edge Runtime. The fix below keeps middleware Edge-safe (cookie check only) and leaves DB-backed permission checks to the layout + `requireModule()` (which run on the Node runtime).

### 1.1 Rename the file
```bash
mv src/proxy.ts src/middleware.ts
```

### 1.2 Replace the contents with an Edge-safe version

Open `src/middleware.ts`. **Replace the entire file** with:

```ts
import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

// Middleware runs on the Edge Runtime — NO Node.js native modules allowed.
// This file only does the fast session-cookie check (Edge-safe).
// Full DB-backed permission checks happen in:
//   - src/app/b/[businessId]/layout.tsx (getBusinessAccess)
//   - src/core/permissions/require-module.ts (requireModule, called by every page/action)
// Those run on the Node runtime where better-sqlite3 is available.

export async function middleware(request: NextRequest) {
  const hasSession = getSessionCookie(request);

  if (!hasSession) {
    if (
      request.nextUrl.pathname.startsWith("/businesses") ||
      request.nextUrl.pathname.startsWith("/b/")
    ) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = { matcher: ["/businesses/:path*", "/b/:path*"] };
```

**What changed from the old `proxy.ts`:**
- **Removed:** `import { auth }` — `auth.api.getSession()` queries the DB, not Edge-safe.
- **Removed:** `import { canAccessModule }` — queries SQLite, not Edge-safe.
- **Removed:** `import { moduleForBusinessPath }` — no longer needed without the DB check.
- **Removed:** The `moduleForBusinessPath` + `canAccessModule` block that rewrote to `/forbidden`.
- **Kept:** `getSessionCookie()` — only parses the cookie, no DB. Edge-safe. ✅

**Why this is safe:** The business layout (`src/app/b/[businessId]/layout.tsx`) already calls `getBusinessAccess(businessId, user.id)` and returns `notFound()` if null. Every page calls `requireModule(businessId, "sales")` which redirects to `/forbidden` if the user lacks the module. Both run on the Node runtime. So permission enforcement is fully preserved — just moved from Edge to Node.

### 1.3 Verify
```bash
npx tsc --noEmit    # must pass
```
- Start the dev server.
- Visit `http://localhost:3000/b/some-id/overview` without being logged in.
- **Expected:** redirect to `/login` (proves middleware now runs + Edge-safe).
- **Before the fix:** the page would render partially before `requireUser()` in the layout finally redirected.

### 1.4 Commit
```bash
git add -A && git commit -m "sprint-0: rename proxy.ts to middleware.ts, make Edge-safe (F1)"
```

---

## Step 2: Switch to Bun (hybrid approach for Windows)

**Problem:** pnpm is slow to install; Node + `tsx` adds startup overhead. Bun is 10–30× faster at installs and runs TypeScript natively.

**Windows note:** If you hit a `NAPI FATAL ERROR` when Bun tries to load the prebuilt `better-sqlite3` binary (happens without Visual Studio C++ Build Tools), use the **hybrid approach**: Bun for the dev server, npm + `tsx` for DB scripts. This avoids installing C++ build tools entirely.

### 2.1 Install Bun
```bash
curl -fsSL https://bun.sh/install | bash
# or if already installed:
bun upgrade
```

### 2.2 Remove pnpm artifacts
```bash
rm pnpm-lock.yaml
rm -rf node_modules
rm pnpm-workspace.yaml   # if it exists and is empty/trivial
```

### 2.3 Update package.json

Open `package.json`. Make these changes:

**Remove the packageManager line:**
```jsonc
// DELETE this line:
"packageManager": "pnpm@11.16.0",
```

**Update scripts (hybrid: Bun for dev, tsx for DB):**
```jsonc
"scripts": {
  "dev": "bun --hot next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:check": "tsx scripts/check-db.ts",
  "db:seed": "tsx scripts/seed.ts",
  "postinstall": "tsx scripts/migrate.ts",
  "test": "tsx --test tests/pre-phase-5.test.ts tests/phase-5.test.ts tests/phase-6.test.ts tests/phase-7.test.ts tests/phase-8.test.ts tests/phase-9.test.ts"
}
```

**Keep `tsx` in devDependencies** (Bun runs the dev server; `tsx` runs DB scripts/tests):
```jsonc
"devDependencies": {
  // ... keep tsx: "4.23.11"
}
```

### 2.4 Install dependencies
```bash
npm install --legacy-peer-deps
```
Using `npm` (not `npm install`) ensures the prebuilt `better-sqlite3` binary is resolved safely on Windows without C++ build tools. This creates `package-lock.json`.

**If you're on macOS/Linux** (no build-tools issue): use `npm install` instead and use `bun run` for all scripts. Skip the hybrid approach.

### 2.5 Verify better-sqlite3 loads
```bash
npx tsx scripts/check-db.ts
```
If it prints "Database check passed", `better-sqlite3` works. If it fails with a native module error, run:
```bash
npm rebuild better-sqlite3
```

### 2.6 Verify scripts work
```bash
npm run typecheck   # must pass
npm run lint        # must pass
npm run db:check    # must pass
```

### 2.7 Update README.md
Replace Docker Compose instructions with native dev instructions:

```markdown
## Development

```bash
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

Seeded local accounts:
- Administrator: admin@demo.local / demo12345
- Standard User: standard@demo.local / demo12345

Useful commands:
```bash
npm run dev          # start dev server (Bun + Turbopack hot reload)
npm run typecheck
npm run lint
npm run db:migrate
npm run db:check
npm run db:seed
npm run test
npm run build
```

Docker is for production only. See `compose.prod.yaml`.
```

### 2.8 Commit
```bash
git add -A && git commit -m "sprint-0: switch to hybrid Bun/npm setup (Bun dev + tsx DB scripts)"
```

---

## Step 3: Re-enable Turbopack

**Problem:** `next dev --webpack` was forced on because Turbopack had route-manifest issues under Docker Compose Watch. With native dev (no Compose Watch), Turbopack works perfectly.

### 3.1 Update next.config.ts

Open `next.config.ts`. The `dev` script already dropped `--webpack` in Step 2. Now clean up the config:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "saxon-js"],
  outputFileTracingIncludes: {
    "/*": ["./src/modules/einvoicing/pint-ae/versions/v1.0.4/validation/*.json"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",  // lowered from 50mb (F14)
    },
  },
};

export default nextConfig;
```

**Removed:** `webpackMemoryOptimizations: true` (no longer needed without webpack).
**Changed:** `bodySizeLimit` from `"50mb"` to `"1mb"` (F14 — server actions don't handle the 50 MB backup import; that's an API route with its own check).

### 3.2 Verify
```bash
npm run dev
```
- **Expected:** startup in <1 second, "Ready in Xms" where X < 1000.
- Edit any `.tsx` file, save — HMR should apply in <200 ms.
- Visit `http://localhost:3000`, log in, navigate around. No errors.

### 3.3 Commit
```bash
git add -A && git commit -m "sprint-0: re-enable turbopack, remove webpack band-aids (F3, F14)"
```

---

## Step 4: Self-host fonts

**Problem:** `layout.tsx` imports 4 Google Fonts (`Inter`, `Roboto`, `Open_Sans`, `Lato`) via `next/font/google`. All are fetched at build time, all 4 CSS variables injected, even though only 1 is active. Plus the layout queries the DB on every render to read the user's font choice.

**Solution:** Self-host the WOFF2 files, declare `@font-face` in a static CSS file, read the font choice from a **cookie** (not DB), and load only the selected font.

### 4.1 Download WOFF2 font files

Create the directory:
```bash
mkdir -p public/fonts
```

**Easiest method — use @fontsource packages:**
```bash
npm install @fontsource/inter @fontsource/roboto @fontsource/open-sans @fontsource/lato
```

Then copy the WOFF2 files from node_modules to public/fonts with a consistent naming convention:
```bash
# Inter (variable weight)
cp node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2 public/fonts/inter-latin.woff2

# Roboto (400, 500, 700)
cp node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2 public/fonts/roboto-latin-400.woff2
cp node_modules/@fontsource/roboto/files/roboto-latin-500-normal.woff2 public/fonts/roboto-latin-500.woff2
cp node_modules/@fontsource/roboto/files/roboto-latin-700-normal.woff2 public/fonts/roboto-latin-700.woff2

# Open Sans (400, 700)
cp node_modules/@fontsource/open-sans/files/open-sans-latin-400-normal.woff2 public/fonts/opensans-latin-400.woff2
cp node_modules/@fontsource/open-sans/files/open-sans-latin-700-normal.woff2 public/fonts/opensans-latin-700.woff2

# Lato (400, 700)
cp node_modules/@fontsource/lato/files/lato-latin-400-normal.woff2 public/fonts/lato-latin-400.woff2
cp node_modules/@fontsource/lato/files/lato-latin-700-normal.woff2 public/fonts/lato-latin-700.woff2
```

**Verify the exact filenames** in `node_modules/@fontsource/*/files/` — they may vary slightly. Adjust the `cp` commands to match.

After copying, you can remove the @fontsource packages from dependencies (they were only needed for the WOFF2 files):
```bash
bun remove @fontsource/inter @fontsource/roboto @fontsource/open-sans @fontsource/lato
```

### 4.2 Create the fonts.css file

Create `public/fonts/fonts.css`:

```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-latin.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Roboto";
  src: url("/fonts/roboto-latin-400.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Roboto";
  src: url("/fonts/roboto-latin-500.woff2") format("woff2");
  font-weight: 500;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Roboto";
  src: url("/fonts/roboto-latin-700.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Open Sans";
  src: url("/fonts/opensans-latin-400.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Open Sans";
  src: url("/fonts/opensans-latin-700.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Lato";
  src: url("/fonts/lato-latin-400.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Lato";
  src: url("/fonts/lato-latin-700.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
  font-style: normal;
}
```

### 4.3 Update layout.tsx

Open `src/app/layout.tsx`. Replace the entire file:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/core/theme/theme-provider";
import { getCurrentSession } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { eq } from "drizzle-orm";
import "./globals.css";

// Keep Inter via next/font for default rendering (prevents FOUC on first paint)
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const FONT_FAMILIES = {
  inter: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "Roboto, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  opensans: "'Open Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  lato: "Lato, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

type FontKey = keyof typeof FONT_FAMILIES;

function isFontKey(value: string): value is FontKey {
  return value in FONT_FAMILIES;
}

export const metadata: Metadata = {
  title: { default: "Ledgerly ERP", template: "%s · Ledgerly ERP" },
  description: "Compact, modern accounting for real businesses.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();

  // Read font/size from cookies first (fast path, no DB query)
  const cookieStore = await cookies();
  let fontKey: FontKey = "inter";
  let themeSize = "normal";

  const cookieFont = cookieStore.get("ui-font")?.value;
  const cookieSize = cookieStore.get("ui-size")?.value;
  if (cookieFont && isFontKey(cookieFont)) fontKey = cookieFont;
  if (cookieSize && ["small", "normal", "large"].includes(cookieSize)) themeSize = cookieSize;

  // If cookies are missing but user is logged in, hydrate cookies from DB
  if (session?.user && (!cookieFont || !cookieSize)) {
    const settings = await getSystemDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.user.id))
      .get();

    if (settings) {
      if (isFontKey(settings.themeFont)) fontKey = settings.themeFont;
      themeSize = settings.themeSize;
    }
  }

  const fontFamily = FONT_FAMILIES[fontKey];

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-font={fontKey}
      data-size={themeSize}
      className={inter.variable}
    >
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body style={{ fontFamily }}>
        <ThemeProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Key changes:**
- Removed `Roboto`, `Open_Sans`, `Lato` from `next/font/google` imports (only `Inter` stays for default FOUC prevention).
- Reads font/size from **cookies** first (zero DB cost on most requests).
- Falls back to DB only if cookies are missing (first visit, or after clearing cookies).
- Injects `<link rel="stylesheet" href="/fonts/fonts.css" />` for self-hosted fonts.
- Sets `style={{ fontFamily }}` on `<body>`.

### 4.4 Update the Appearance settings action to set cookies

Open `src/modules/appearance/actions.ts`. Add cookie-setting to the `upsertUserSettings` action:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { eq } from "drizzle-orm";

const settingsSchema = z.object({
  themeFont: z.enum(["inter", "roboto", "opensans", "lato"]),
  themeSize: z.enum(["small", "normal", "large"]),
});

export type SettingsResult = { error?: string };

export async function upsertUserSettings(input: unknown): Promise<SettingsResult> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid appearance settings." };

  const now = new Date().toISOString();
  const existing = await getSystemDb()
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .get();

  if (existing) {
    await getSystemDb()
      .update(userSettings)
      .set({ themeFont: parsed.data.themeFont, themeSize: parsed.data.themeSize, updatedAt: now })
      .where(eq(userSettings.userId, user.id))
      .run();
  } else {
    await getSystemDb()
      .insert(userSettings)
      .values({ id: crypto.randomUUID(), userId: user.id, themeFont: parsed.data.themeFont, themeSize: parsed.data.themeSize, createdAt: now, updatedAt: now })
      .run();
  }

  // Set cookies for fast reads in layout (no DB query on subsequent requests)
  const cookieStore = await cookies();
  cookieStore.set("ui-font", parsed.data.themeFont, {
    maxAge: 60 * 60 * 24 * 365,  // 1 year
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  cookieStore.set("ui-size", parsed.data.themeSize, {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
  return {};
}
```

**Note:** Read the existing `actions.ts` first and preserve any existing logic — the above is the full replacement but your file may have slightly different structure. The key addition is the cookie-setting block.

### 4.5 Update globals.css font mappings

Open `src/app/globals.css`. The existing `html[data-font="..."]` rules should already work. Verify these lines exist and keep them, or simplify to:

```css
html[data-font="inter"] { --font-base: "Inter", ui-sans-serif, system-ui, sans-serif; }
html[data-font="roboto"] { --font-base: "Roboto", ui-sans-serif, system-ui, sans-serif; }
html[data-font="opensans"] { --font-base: "Open Sans", ui-sans-serif, system-ui, sans-serif; }
html[data-font="lato"] { --font-base: "Lato", ui-sans-serif, system-ui, sans-serif; }
```

### 4.6 Verify
```bash
npm run typecheck   # must pass
npm run lint        # must pass
npm run dev
```
- Log in, go to Settings → Appearance.
- Change font to Roboto → page should re-render with Roboto font.
- Check browser DevTools → Network tab → filter by "fonts" → only the Roboto WOFF2 files should be downloaded (not Inter, Open Sans, Lato).
- Change to Open Sans → only Open Sans WOFF2 downloads.
- Refresh page → font persists (cookie).
- Check DevTools → Application → Cookies → `ui-font` and `ui-size` should be set.

### 4.7 Commit
```bash
git add -A && git commit -m "sprint-0: self-host fonts, cookie-based selection (F9, F8)"
```

---

## Step 5: Gate demo credentials (F11)

**Problem:** The login form pre-fills `admin@demo.local` / `demo12345` in production builds too.

### 5.1 Update login-form.tsx

Open `src/app/(auth)/login/login-form.tsx`. Change the two `defaultValue` attributes:

```tsx
// Before:
<Input id="email" name="email" type="email" autoComplete="email" defaultValue="admin@demo.local" required />
...
<Input id="password" name="password" type="password" autoComplete="current-password" defaultValue="demo12345" required />
```

```tsx
// After:
<Input
  id="email"
  name="email"
  type="email"
  autoComplete="email"
  defaultValue={process.env.NODE_ENV === "development" ? "admin@demo.local" : ""}
  required
/>
...
<Input
  id="password"
  name="password"
  type="password"
  autoComplete="current-password"
  defaultValue={process.env.NODE_ENV === "development" ? "demo12345" : ""}
  required
/>
```

Also gate the demo hint text:
```tsx
// Before:
<span className="text-xs text-muted-foreground">Demo: demo12345</span>

// After:
{process.env.NODE_ENV === "development" && (
  <span className="text-xs text-muted-foreground">Demo: demo12345</span>
)}
```

### 5.2 Verify
```bash
npm run dev
```
- Visit `/login` → email and password should be pre-filled (development mode).
- The "Demo: demo12345" hint should show.

To test production behavior:
```bash
NODE_ENV=production npm run dev
```
- Visit `/login` → fields should be empty.
- No demo hint shown.

### 5.3 Commit
```bash
git add -A && git commit -m "sprint-0: gate demo credentials behind development mode (F11)"
```

---

## Step 6: Final verification

### 6.1 Full checklist
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run db:check` passes
- [ ] `npm run test` passes (all 82 tests)
- [ ] `npm run dev` starts in <2 seconds
- [ ] HMR applies in <300 ms when editing a TSX file
- [ ] Visiting a protected route while logged out redirects to `/login` (middleware works)
- [ ] Login works with demo credentials (dev mode)
- [ ] Font picker works — changing font updates the UI without page reload
- [ ] Browser DevTools shows only the selected font's WOFF2 is downloaded
- [ ] No console errors in browser

### 6.2 Performance check
```bash
# Time the dev server startup
time npm run dev
# Expected: "Ready in" message within 1-2 seconds
```

### 6.3 Cleanup (optional)
- Delete `Dockerfile.dev` (no longer needed for dev — Docker is prod-only).
- Rename `compose.yaml` → `compose.prod.yaml` (will be updated in a later sprint for production).
- Delete `pnpm-workspace.yaml` if it exists and is empty.

### 6.4 Final commit
```bash
git add -A && git commit -m "sprint-0: cleanup docker dev artifacts"
```

---

## What's next

Sprint 0 is complete. The dev loop is now instant. Move to `sprint-1-correctness-perf.md` for:
- React `cache()` on hot reads
- LRU business DB connection pool
- Error/loading boundaries for all route groups
- Login rate-limiting + CSP headers
- Dead code cleanup
