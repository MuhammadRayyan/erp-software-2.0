import { getSystemSqlite } from "@/core/db/system";
import { checkDatabases } from "@/core/db/check";

// Docker probes readiness every 15s. The per-tenant schema check opens every
// business database, so run it on the first probe and then every 10 minutes;
// the system database round-trip still runs on every probe.
const TENANT_CHECK_INTERVAL_MS = 10 * 60 * 1000;

let checkedAt = 0;
export function getReadiness() {
  getSystemSqlite().prepare("SELECT 1").get();
  if (Date.now() - checkedAt > TENANT_CHECK_INTERVAL_MS) {
    checkDatabases({ deep: false });
    checkedAt = Date.now();
  }
  return { status: "ok", revision: process.env.APP_REVISION ?? "development" };
}
