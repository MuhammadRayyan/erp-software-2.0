"use server";

import { requireUser } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

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

  // Set cookies for fast reads in layout (no DB query on subsequent requests)
  const cookieStore = await cookies();
  cookieStore.set("ui-font", themeFont, {
    maxAge: 60 * 60 * 24 * 365,  // 1 year
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  cookieStore.set("ui-size", themeSize, {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
}
