import { checkDatabases } from "../src/core/db/check";

const result = checkDatabases();
console.log(`System database: schema ${result.systemVersion}, foreign keys valid.`);
for (const business of result.businesses) {
  console.log(`${business.label}: schema ${business.version}, foreign keys valid.`);
}
console.log(`Database check passed for ${result.businesses.length} business database(s).`);
