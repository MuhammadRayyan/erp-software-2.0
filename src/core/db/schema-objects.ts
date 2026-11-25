import Database from "better-sqlite3";
import { migrateBusinessDatabase } from "./business-migrations";

type SchemaObject = { type: "trigger" | "view"; name: string; sql: string | null };

let referenceObjects: Map<string, SchemaObject> | undefined;

function listTriggersAndViews(sqlite: Database.Database) {
  return sqlite
    .prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('trigger', 'view') ORDER BY name")
    .all() as SchemaObject[];
}

function normalizeSql(sql: string | null) {
  return (sql ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Triggers and views produced by migrating a fresh business database. */
function getReferenceObjects() {
  if (!referenceObjects) {
    const reference = new Database(":memory:");
    try {
      reference.pragma("foreign_keys = ON");
      migrateBusinessDatabase(reference, "reference business schema");
      referenceObjects = new Map(listTriggersAndViews(reference).map((object) => [object.name, object]));
    } finally {
      reference.close();
    }
  }
  return referenceObjects;
}

/**
 * An uploaded business database becomes a live tenant database, so it must not
 * carry its own triggers or views: those run inside the app's transactions and
 * could silently rewrite posted ledger rows or the activity log. Unknown
 * objects are rejected; known objects whose definition differs from the
 * migrated reference are replaced with the reference definition.
 */
export function enforceReferenceSchemaObjects(sqlite: Database.Database) {
  const reference = getReferenceObjects();
  const actual = listTriggersAndViews(sqlite);

  const unexpected = actual.filter((object) => reference.get(object.name)?.type !== object.type);
  if (unexpected.length > 0) {
    const names = unexpected.slice(0, 5).map((object) => `${object.type} ${object.name}`).join(", ");
    throw new Error(`Backup contains database objects that are not part of the application schema: ${names}.`);
  }

  const tampered = actual.filter((object) => normalizeSql(object.sql) !== normalizeSql(reference.get(object.name)!.sql));
  if (tampered.length === 0) return { replaced: 0 };

  sqlite.transaction(() => {
    for (const object of tampered) {
      const definition = reference.get(object.name)!;
      sqlite.exec(`DROP ${object.type.toUpperCase()} IF EXISTS "${object.name.replaceAll('"', '""')}"`);
      if (definition.sql) sqlite.exec(definition.sql);
    }
  })();
  return { replaced: tampered.length };
}
