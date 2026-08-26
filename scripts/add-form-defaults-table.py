import os

filepath = "src/core/db/business-schema.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_table = """
export const formDefaults = sqliteTable("form_defaults", {
  id: text("id").primaryKey(),
  formType: text("form_type").notNull(), // 'sales-invoice', 'purchase-order', etc.
  payloadJson: text("payload_json").notNull(), // JSON representation of the form default values
  updatedAt: text("updated_at").notNull(),
});
"""

c = c + "\n" + new_table

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
