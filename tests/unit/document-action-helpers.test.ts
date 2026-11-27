import assert from "node:assert/strict";
import test from "node:test";

const { pricedLinesToInput, exchangeRateToInput } = await import("../../src/modules/documents/engine/document-action-helpers");

const stored = [
  { itemId: "item-1", description: "Widget", quantityMicros: 15_000, discountType: "percentage", discountValue: "5", unitPriceMinor: 12_345, salesAccountId: "acct-sales", taxCodeId: "tax-5", projectId: "prj-1", customFields: { f1: "SER-1" } },
  { itemId: null, description: "Service", quantityMicros: 10_000, discountType: null, discountValue: null, unitPriceMinor: 5, salesAccountId: null, taxCodeId: null, projectId: null },
];

test("converted lines copy prices at the currency's built-in precision and drop custom fields", () => {
  assert.deepEqual(pricedLinesToInput(stored, "AED", "salesAccountId"), [
    { itemId: "item-1", description: "Widget", quantity: "1.5", discountType: "percentage", discountValue: "5", unitPrice: "123.45", salesAccountId: "acct-sales", taxCodeId: "tax-5", projectId: "prj-1" },
    { itemId: "", description: "Service", quantity: "1", discountType: "none", discountValue: "0", unitPrice: "0.05", salesAccountId: "", taxCodeId: "", projectId: "" },
  ]);
});

test("duplicated lines use the configured minor unit and keep custom fields", () => {
  const [first, second] = pricedLinesToInput(stored, "AED", "salesAccountId", { minorUnit: 3, customFields: true });
  assert.equal(first.unitPrice, "12.345");
  assert.deepEqual(first.customFields, { f1: "SER-1" });
  assert.deepEqual(second.customFields, {});
});

test("purchase lines map the expense account", () => {
  const [line] = pricedLinesToInput([{ ...stored[0], salesAccountId: undefined, expenseAccountId: "acct-exp" }], "AED", "expenseAccountId");
  assert.equal(line.expenseAccountId, "acct-exp");
  assert.equal("salesAccountId" in line, false);
});

test("exchange-rate fields fall back to the requested source", () => {
  assert.deepEqual(exchangeRateToInput({ currencyCode: "USD", exchangeRateToBase: "3.6725", exchangeRateDate: null, exchangeRateSource: null }, "Manual"), {
    currencyCode: "USD", exchangeRateToBase: "3.6725", exchangeRateDate: "", exchangeRateSource: "Manual",
  });
  assert.equal(exchangeRateToInput({ currencyCode: "AED", exchangeRateToBase: 1, exchangeRateDate: "2035-01-01", exchangeRateSource: "CBUAE" }, "Base").exchangeRateSource, "CBUAE");
});
