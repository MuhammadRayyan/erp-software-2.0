# Branch Changes: `antigravity-edits`

## Feature: Global Appearance Settings

**Status:** Implemented

A new global appearance settings feature has been added, allowing users to customize the interface font and scaling. These settings are persisted securely in the system database, ensuring cross-device consistency for the logged-in user.

### Key Capabilities
- **Font Family Customization:** Select from industry-standard fonts (Inter, Roboto, Open Sans, Lato).
- **Text Scaling:** Adjust global text size scaling factors (Small, Normal, Large).
- **Cross-Device Persistence:** Preferences are stored in the system database via the `user_settings` table, meaning settings seamlessly travel with the user if they switch devices.
- **Zero FOUC:** Settings are fetched during the initial server render in Next.js, eliminating "flash of unstyled content" (FOUC).

### Architecture & Implementation Details
- **Schema Migration:** Added `user_settings` table to the `system` database, linked to `users.id` with a cascade deletion constraint.
- **CSS Variable Injection:** Refactored `src/app/layout.tsx` to inject Next.js Google Fonts variables (e.g. `--font-roboto`) and scaling variables as custom properties directly on the `<html>` root via `data-font` and `data-size` attributes.
- **UI Consistency:** The Appearance Settings page (`src/app/b/[businessId]/settings/appearance/page.tsx`) mimics the standard layout, components (`<Button>`), and UI patterns found in existing settings pages (like Tax Settings).
- **Server Actions:** Implemented `upsertUserSettings` in `src/modules/appearance/actions.ts` to execute database upserts safely with server-side revalidation (`revalidatePath`) for instant visual updates.

## Sprint 0: Dev Environment Unblock

**Status:** Implemented

Restored and optimized the development environment by fixing the middleware, resolving package manager native module conflicts, enabling Turbopack, and self-hosting fonts for a faster and offline-capable workflow.

### Key Capabilities
- **Next.js Turbopack Support:** Re-enabled Turbopack for significantly faster local development rebuilds.
- **Self-Hosted Fonts:** Moved from Google Fonts to locally hosted `woff2` files (Inter, Roboto, Open Sans, Lato) for faster hydration and privacy.
- **Demo Mode:** `login-form.tsx` automatically fills demo credentials (`admin@demo.local` / `demo12345`) only in development environments (`NODE_ENV === "development"`).

### Architecture, Deviations & Implementation Details
- **Middleware Fix & Edge Runtime Conflict:** Renamed `proxy.ts` to `middleware.ts`. However, Next.js Edge Middleware does not support Node.js native modules (`better-sqlite3.node`). To prevent the app from crashing with a 500 error, we moved the database access control logic (`moduleForBusinessPath` and `canAccessModule`) into the Server Component layout (`src/app/b/[businessId]/layout.tsx`). The middleware now strictly checks the session cookie and forwards the request path via the `x-pathname` header for the layout to enforce access rules.
- **Dependency & Build Tool Deviations:** Removed `pnpm`. Attempted to move fully to `bun`, but `better-sqlite3` native binaries crash under Bun on Windows without the MSVC C++ toolchain to rebuild them. 
  - **Resolution:** Reverted database scripts (`db:migrate`, `db:check`, `test`, etc.) to use `tsx`. Installed dependencies using `npm install --legacy-peer-deps` to safely download the prebuilt `better-sqlite3` binary. Bun is still used to run the Next.js dev server.
- **Fast Font Hydration:** Modified `layout.tsx` to read `ui-font` and `ui-size` settings directly from cookies, bypassing database lookups during the initial render and eliminating FOUC. Updated the `upsertUserSettings` server action to set these cookies whenever preferences change.
