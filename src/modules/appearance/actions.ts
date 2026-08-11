"use server";

import { requireUser } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { revalidatePath } from "next/cache";

export async function upsertUserSettings(themeFont: string, themeSize: string) {
  const user = await requireUser();
  const db = getSystemDb();

  await db
    .insert(userSettings)
    .values({
      userId: user.id,
      themeFont,
      themeSize,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        themeFont,
        themeSize,
      },
    });

  revalidatePath("/", "layout");
}
