import { migrateDatabases } from "../src/core/db/migrate";

migrateDatabases();
console.log("System and business databases are migrated.");
