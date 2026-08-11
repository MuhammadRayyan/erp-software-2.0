import { migrateDatabases } from "../src/core/db/migrate";
import { seedDemoData } from "../src/core/db/seed";

migrateDatabases();
await seedDemoData();
console.log("Modern ERP development data is ready.");
