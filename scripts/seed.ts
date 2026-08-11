import { migrateDatabases } from "../src/core/db/migrate";
import { seedDemoData } from "../src/core/db/seed";

migrateDatabases();
const result = await seedDemoData();
console.log(`Seeded demo users and ${result.business.name}.`);
