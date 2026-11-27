import { expect, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

type Role = "admin" | "warehouse" | "salesviewer" | "creator" | "settingsviewer" | "standard";
type Cookies = Awaited<ReturnType<BrowserContext["cookies"]>>;
const sessions = new Map<Role, Cookies>();

// Playwright starts a new worker after every failed test, which would empty the
// in-memory cache and cascade into the login rate limit. Sessions are therefore
// also kept in the run's disposable data directory.
function sessionFile(role: Role) {
  const root = process.env.ERP_BROWSER_DATA_DIR;
  return root ? path.join(root, "sessions", `${role}.json`) : undefined;
}

function cachedSession(role: Role): Cookies | undefined {
  const cached = sessions.get(role);
  if (cached) return cached;
  const file = sessionFile(role);
  if (!file || !existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as Cookies;
}

function storeSession(role: Role, cookies: Cookies | undefined) {
  const file = sessionFile(role);
  if (cookies) {
    sessions.set(role, cookies);
    if (file) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(cookies));
    }
  } else {
    sessions.delete(role);
    if (file) rmSync(file, { force: true });
  }
}

/** Reuse synthetic role sessions without weakening the application's login limits. */
export async function login(page: Page, role: Role = "admin") {
  // Answer telemetry calls locally; aborting them would log console errors that
  // zero-console-error checks then report.
  await page.route(/sentry\.io|\/monitoring(?:\?|$)/, route => route.fulfill({ status: 204, body: "" }));
  await page.context().clearCookies();
  const businesses = page.getByRole("heading", { name: "My Businesses" });
  const cookies = cachedSession(role);
  if (cookies) {
    await page.context().addCookies(cookies);
    await page.goto("/businesses");
    if (await businesses.isVisible()) return;
    // The cached session was signed out or revoked by an earlier test.
    storeSession(role, undefined);
    await page.context().clearCookies();
  }
  await page.goto("/login");
  const email =
    role === "admin"
      ? "admin@demo.local"
      : role === "standard"
        ? "standard@demo.local"
        : `${role}@hardening.invalid`;
  const password =
    role === "admin" || role === "standard" ? "demo12345" : "SyntheticPass123!";
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(businesses).toBeVisible();
  storeSession(role, await page.context().cookies());
}

/** The seeded demo business from the browser fixture. */
export function demoBusinessId(): string {
  return (JSON.parse(readFileSync(process.env.ERP_BROWSER_META!, "utf8")) as { businessId: string }).businessId;
}

/** Sign in as the demo admin and open the demo business overview. */
export async function openDemoBusiness(page: Page, role: Role = "admin") {
  await login(page, role);
  await page.goto(`/b/${demoBusinessId()}/overview`);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({ timeout: 15_000 });
}
