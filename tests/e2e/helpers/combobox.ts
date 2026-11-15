import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Selects an option from a Sprint 3 Radix + cmdk <Combobox>.
 * Supports visible label / substring / RegExp, option UUID value (`data-option-value`),
 * or clearing back to empty via `__clear__`.
 */
async function openComboboxPopover(page: Page, trigger: Locator) {
  await expect(trigger).toBeVisible();
  const popover = page.locator("[cmdk-root]:visible").last();
  await expect(async () => {
    if ((await popover.count()) === 0) {
      if ((await trigger.getAttribute("aria-expanded")) !== "true") {
        await trigger.click();
      }
    }
    await expect(popover).toBeVisible({ timeout: 800 });
  }).toPass({ intervals: [150, 300, 600], timeout: 8000 });
  return popover;
}

export async function selectComboboxOption(
  page: Page,
  trigger: Locator,
  valueOrText: string | RegExp,
) {
  const popover = await openComboboxPopover(page, trigger);

  const input = popover.locator("[cmdk-input]");
  if (typeof valueOrText === "string") {
    await popover
      .locator("[cmdk-item]")
      .first()
      .waitFor({ state: "attached", timeout: 1500 })
      .catch(() => {});

    const byValue = popover.locator(`[data-option-value="${valueOrText}"]`);
    if ((await byValue.count()) > 0) {
      await byValue.first().click();
      return;
    }

    // If a UUID / ID wasn't in the initial virtualized viewport slice, scroll the virtual list before falling back to search.
    const virtualScroller = popover.locator(".overflow-y-auto").first();
    if ((await virtualScroller.count()) > 0) {
      for (let step = 0; step < 30; step++) {
        const atEnd = await virtualScroller.evaluate((el) => {
          const prev = el.scrollTop;
          el.scrollTop = Math.min(el.scrollTop + 180, el.scrollHeight);
          return el.scrollTop === prev && el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        });
        await page.waitForTimeout(30);
        if ((await byValue.count()) > 0) {
          await byValue.first().click();
          return;
        }
        if (atEnd) break;
      }
      await virtualScroller.evaluate((el) => {
        el.scrollTop = 0;
      });
    }

    await input.fill(valueOrText);
    const byValueAfterFilter = popover.locator(`[data-option-value="${valueOrText}"]`);
    if ((await byValueAfterFilter.count()) > 0) {
      await byValueAfterFilter.first().click();
      return;
    }

    const byText = popover.locator("[cmdk-item]").filter({ hasText: valueOrText }).first();
    await expect(byText).toBeVisible();
    await byText.click();
    return;
  }

  const byRegex = popover.locator("[cmdk-item]").filter({ hasText: valueOrText }).first();
  await expect(byRegex).toBeVisible();
  await byRegex.click();
}

/**
 * Selects the Nth real option from a <Combobox> (1-based index among `[data-option-value]` items,
 * matching legacy `selectOption({ index: N })` behavior where index 0 was the empty placeholder).
 */
export async function selectComboboxByIndex(
  page: Page,
  trigger: Locator,
  oneBasedIndex: number,
) {
  const popover = await openComboboxPopover(page, trigger);

  const items = popover.locator("[cmdk-item][data-option-value]");
  const item = items.nth(Math.max(0, oneBasedIndex - 1));
  await expect(item).toBeVisible();
  await item.click();
}
