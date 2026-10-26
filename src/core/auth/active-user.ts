import { eq } from "drizzle-orm";
import { getSystemDb } from "@/core/db/system";
import { users } from "@/core/db/system-schema";

/** Re-read account state: a valid cookie must not preserve access after suspension. */
export function assertActiveUser(userId: string) {
  const user = getSystemDb().select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.status === "suspended") throw new Error("ACCOUNT_ACCESS_DENIED: This account is unavailable.");
  return user;
}
