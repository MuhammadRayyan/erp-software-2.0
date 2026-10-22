"use server";

import { redirect } from "next/navigation";
import { createRootSuperAdmin, isSetupComplete } from "@/core/auth/setup-service";

export type SetupActionResult = {
  success?: boolean;
  error?: string;
};

export async function setupSuperAdminAction(
  _prevState: SetupActionResult | null,
  formData: FormData,
): Promise<SetupActionResult> {
  if (isSetupComplete()) {
    return { error: "Setup is already completed. Access to initialization is permanently forbidden." };
  }

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const setupKey = String(formData.get("setupKey") || "").trim();

  if (!name) return { error: "Super-Admin full name is required." };
  if (!email) return { error: "Super-Admin email address is required." };
  if (!password || password.length < 8) return { error: "Password must be at least 8 characters long." };
  if (!setupKey) return { error: "The server Setup Key is required." };

  try {
    await createRootSuperAdmin({
      name,
      email,
      password,
      setupKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize super-admin.";
    return { error: message.replace(/^[A-Z_]+:\s*/, "") };
  }

  redirect("/login?setup=success");
}
