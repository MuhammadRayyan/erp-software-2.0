"use server";

import { z } from "zod";
import { requireUser } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const THEME_FONTS = ["inter", "roboto", "opensans", "lato"] as const;
const THEME_SIZES = ["small", "normal", "large"] as const;

const settingsSchema = z.object({
  themeFont: z.enum(THEME_FONTS),
  themeSize: z.enum(THEME_SIZES),
});

export async function upsertUserSettings(themeFont: string, themeSize: string) {
  const user = await requireUser();

  const parsed = settingsSchema.safeParse({ themeFont, themeSize });
  if (!parsed.success) {
    return { error: "Invalid appearance settings." };
  }

  const db = getSystemDb();

  await db
    .insert(userSettings)
    .values({
      userId: user.id,
      themeFont: parsed.data.themeFont,
      themeSize: parsed.data.themeSize,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        themeFont: parsed.data.themeFont,
        themeSize: parsed.data.themeSize,
      },
    });

  // Set cookies for fast reads in layout (no DB query on subsequent requests)
  const cookieStore = await cookies();
  for (const [name, value] of [
    ["ui-font", parsed.data.themeFont],
    ["ui-size", parsed.data.themeSize],
  ] as const) {
    cookieStore.set(name, value, {
      maxAge: 60 * 60 * 24 * 365,  // 1 year
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  revalidatePath("/", "layout");
}
