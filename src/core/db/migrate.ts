import { getSystemDb, getSystemSqlite, migrateSystemDatabase } from "./system";
import { businesses } from "./system-schema";
import { openBusinessDatabase } from "./business";
import { synchronizeBusinessBaseCurrency } from "@/modules/currency/exchange-rate";

export function migrateDatabases() {
  migrateSystemDatabase(getSystemSqlite());
  const registry = getSystemDb().select({ directoryKey: businesses.directoryKey, currency: businesses.currency }).from(businesses).all();
  for (const business of registry) {
    const context = openBusinessDatabase(business.directoryKey);
    synchronizeBusinessBaseCurrency(context.sqlite, business.currency);
  }
}
