# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g2_test.spec.ts >> G2 standalone
- Location: e2e\g2_test.spec.ts:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/quantity change/i)

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]
  - main [ref=e11]:
    - generic [ref=e12]:
      - heading "Record not found" [level=1] [ref=e18]
      - paragraph [ref=e19]: The record may have been removed, archived, or unavailable to your account.
      - link "Go to businesses" [ref=e20] [cursor=pointer]:
        - /url: /businesses
  - region "Notifications alt+T"
  - alert [ref=e21]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('G2 standalone', async ({ page }) => {
  4  |   await page.goto('http://localhost:3000/b/demo/inventory/adjustments/new');
> 5  |   await page.getByLabel(/quantity change/i).fill('999999999999');
     |                                             ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  6  |   await page.getByRole('button', { name: /post adjustment/i }).click();
  7  |   await page.waitForTimeout(2000);
  8  |   console.log(await page.content());
  9  | });
  10 | 
```