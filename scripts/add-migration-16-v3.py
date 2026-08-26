import os

filepath = "src/core/db/business-migrations.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_migration = """
  {
    version: 16,
    name: "form_defaults",
    up: (sqlite) => {
      sqlite.exec(
        CREATE TABLE IF NOT EXISTS form_defaults (
          id TEXT PRIMARY KEY,
          form_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS form_defaults_form_type_idx ON form_defaults(form_type);
      );
    },
  },
] satisfies readonly SqliteMigration[];
"""

c = c.replace("] satisfies readonly SqliteMigration[];", new_migration)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
