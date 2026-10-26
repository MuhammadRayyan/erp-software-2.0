import { getSystemSqlite } from "@/core/db/system";
import { checkDatabases } from "@/core/db/check";

let checkedAt = 0;
export function getReadiness() {
  getSystemSqlite().prepare("SELECT 1").get();
  if (Date.now() - checkedAt > 5_000) {
    checkDatabases({ deep: false });
    checkedAt = Date.now();
  }
  return { status: "ok", revision: process.env.APP_REVISION ?? "development" };
}
