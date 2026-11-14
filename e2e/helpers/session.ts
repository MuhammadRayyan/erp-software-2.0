import { expect, type BrowserContext, type Page } from "@playwright/test";

type Role = "admin" | "warehouse" | "salesviewer" | "creator" | "standard";
const sessions = new Map<Role, Awaited<ReturnType<BrowserContext["cookies"]>>>();

/** Reuse synthetic role sessions without weakening the application's login limits. */
export async function login(page: Page, role: Role = "admin") {
  await page.route(/sentry\.io|\/monitoring(?:\?|$)/, route => route.abort());
  await page.context().clearCookies();
  const cookies = sessions.get(role);
  if (cookies) {
    await page.context().addCookies(cookies);
    await page.goto("/businesses");
  } else {
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
    await expect(page.getByRole("heading", { name: "My Businesses" })).toBeVisible();
    sessions.set(role, await page.context().cookies());
  }
  await expect(page.getByRole("heading", { name: "My Businesses" })).toBeVisible();
}
