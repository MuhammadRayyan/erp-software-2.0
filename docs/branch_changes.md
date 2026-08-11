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
