import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-custom-fields-")),
  BETTER_AUTH_SECRET: "custom-fields-test-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { closeAllBusinessConnections, getBusinessDb } = await import("../src/core/db/business");
const {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  getCustomFieldDefinition,
  getCustomFieldValuesForEntities,
  listCustomFieldDefinitions,
  moveCustomFieldDefinition,
  saveCustomFieldValues,
  saveCustomFieldValuesInTransaction,
  updateCustomFieldDefinition,
} = await import("../src/modules/custom-fields/custom-field-service");
const { customFieldDefinitionSchema } = await import("../src/modules/custom-fields/custom-field-input");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

function cleanup() {
  sqlite.exec("DELETE FROM custom_field_definitions");
}

test("migration 13 installs the custom field tables and indexes", () => {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'custom_field%'")
    .all()
    .map((row) => (row as { name: string }).name);
  assert.deepEqual(tables.sort(), ["custom_field_definitions", "custom_field_values"]);
  const indexes = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'custom_field%'")
    .all()
    .map((row) => (row as { name: string }).name);
  assert.ok(indexes.includes("custom_field_values_definition_entity"));
  assert.ok(indexes.includes("custom_field_definitions_entity"));
});

test("definition schema enforces select option rules", () => {
  assert.equal(customFieldDefinitionSchema.safeParse({ entityType: "customer", name: "Industry", fieldType: "select", selectOptions: [] }).success, false);
  assert.equal(customFieldDefinitionSchema.safeParse({ entityType: "customer", name: "Industry", fieldType: "text", selectOptions: ["A"] }).success, false);
  assert.equal(customFieldDefinitionSchema.safeParse({ entityType: "customer", name: "Industry", fieldType: "select", selectOptions: ["A", "A"] }).success, false);
  const parsed = customFieldDefinitionSchema.parse({ entityType: "customer", name: "Industry", fieldType: "select", selectOptions: ["A", "B"] });
  assert.deepEqual(parsed.selectOptions, ["A", "B"]);
  assert.equal(parsed.isRequired, false);
  assert.equal(parsed.showInList, false);
  assert.equal(parsed.position, 0);
});

test("create, list, update, move, and delete definitions", () => {
  cleanup();
  const first = createCustomFieldDefinition(businessId, adminId, { entityType: "customer", name: "Referral Source", fieldType: "select", selectOptions: ["Walk-in", "Website", "Referral"], isRequired: false, showInList: true });
  const second = createCustomFieldDefinition(businessId, adminId, { entityType: "customer", name: "Industry", fieldType: "text" });
  const supplierField = createCustomFieldDefinition(businessId, adminId, { entityType: "supplier", name: "Industry", fieldType: "text" });

  let list = listCustomFieldDefinitions(businessId, adminId, "customer");
  assert.deepEqual(list.map((row) => row.name), ["Referral Source", "Industry"]);
  assert.equal(list[0].position, 0);
  assert.equal(list[1].position, 1);
  assert.deepEqual(list[0].selectOptions, ["Walk-in", "Website", "Referral"]);
  assert.equal(list[0].showInList, true);

  const all = listCustomFieldDefinitions(businessId, adminId);
  assert.equal(all.length, 3);

  // move swaps neighbors
  moveCustomFieldDefinition(businessId, adminId, second, "up");
  list = listCustomFieldDefinitions(businessId, adminId, "customer");
  assert.deepEqual(list.map((row) => row.name), ["Industry", "Referral Source"]);

  // moving the first field up is a no-op
  moveCustomFieldDefinition(businessId, adminId, list[0].id, "up");
  assert.deepEqual(listCustomFieldDefinitions(businessId, adminId, "customer").map((row) => row.name), ["Industry", "Referral Source"]);

  // update keeps values, can change options
  updateCustomFieldDefinition(businessId, adminId, first, { entityType: "customer", name: "Referral", fieldType: "select", selectOptions: ["Walk-in", "Website"] });
  const updated = getCustomFieldDefinition(businessId, adminId, first);
  assert.equal(updated?.name, "Referral");
  assert.deepEqual(updated?.selectOptions, ["Walk-in", "Website"]);

  // deleting a definition cascades its values
  saveCustomFieldValues(businessId, adminId, "supplier", "supplier-1", { [supplierField]: "Retail" });
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM custom_field_values").get() as { count: number }).count, 1);
  deleteCustomFieldDefinition(businessId, adminId, supplierField);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM custom_field_values").get() as { count: number }).count, 0);
  assert.equal(listCustomFieldDefinitions(businessId, adminId, "supplier").length, 0);
  assert.throws(() => deleteCustomFieldDefinition(businessId, adminId, supplierField), /not found/i);
  cleanup();
});

test("saveCustomFieldValues validates and upserts values", () => {
  cleanup();
  const definition = createCustomFieldDefinition(businessId, adminId, { entityType: "customer", name: "Referral Source", fieldType: "select", selectOptions: ["Walk-in", "Website"], isRequired: true });
  const dateField = createCustomFieldDefinition(businessId, adminId, { entityType: "customer", name: "Onboarded", fieldType: "date" });
  const numberField = createCustomFieldDefinition(businessId, adminId, { entityType: "customer", name: "Credit Days", fieldType: "number" });
  const checkField = createCustomFieldDefinition(businessId, adminId, { entityType: "customer", name: "VIP", fieldType: "checkbox" });

  assert.throws(() => saveCustomFieldValues(businessId, adminId, "customer", "cust-1", {}), /Referral Source.*required/i);

  assert.throws(() => saveCustomFieldValues(businessId, adminId, "customer", "cust-1", { [definition]: "Friend" }), /not an option/i);
  assert.throws(() => saveCustomFieldValues(businessId, adminId, "customer", "cust-1", { [definition]: "Website", [dateField]: "2024-13-45" }), /valid date/i);
  assert.throws(() => saveCustomFieldValues(businessId, adminId, "customer", "cust-1", { [definition]: "Website", [numberField]: "abc" }), /must be a number/i);

  saveCustomFieldValues(businessId, adminId, "customer", "cust-1", { [definition]: "Website", [dateField]: "2024-06-15", [numberField]: "30.5", [checkField]: "true" });

  const values = getCustomFieldValuesForEntities(businessId, adminId, "customer", ["cust-1"]);
  assert.equal(values.get("cust-1")?.[definition], "Website");
  assert.equal(values.get("cust-1")?.[dateField], "2024-06-15");
  assert.equal(values.get("cust-1")?.[numberField], "30.5");
  assert.equal(values.get("cust-1")?.[checkField], "true");
  assert.equal(values.size, 1);
  assert.equal(getCustomFieldValuesForEntities(businessId, adminId, "customer", []).size, 0);

  // upsert overwrites, checkbox normalizes to false
  saveCustomFieldValues(businessId, adminId, "customer", "cust-1", { [definition]: "Walk-in", [checkField]: "" });
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM custom_field_values").get() as { count: number }).count, 4);
  const after = getCustomFieldValuesForEntities(businessId, adminId, "customer", ["cust-1"]);
  assert.equal(after.get("cust-1")?.[definition], "Walk-in");
  assert.equal(after.get("cust-1")?.[checkField], "false");

  // in-transaction variant runs inside the caller's transaction
  sqlite.transaction(() => {
    saveCustomFieldValuesInTransaction(sqlite, "customer", "cust-2", { [definition]: "Website" });
  }).immediate();
  assert.equal(getCustomFieldValuesForEntities(businessId, adminId, "customer", ["cust-2"]).get("cust-2")?.[definition], "Website");
  cleanup();
});

// Close pooled business connections after all tests so pending idle timers do
// not keep the test process alive for five minutes.
after(() => closeAllBusinessConnections());
