export function validateDisplayName(name?: unknown): { valid: boolean; error?: string; name?: string } {
  if (typeof name !== "string") {
    return { valid: false, error: "Display name is required." };
  }
  const trimmed = name.replace(/[\r\n\t]+/g, " ").trim();
  if (!trimmed || trimmed.length < 2) {
    return { valid: false, error: "Display name must be at least 2 characters long." };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: "Display name cannot exceed 100 characters." };
  }
  return { valid: true, name: trimmed };
}

export function validatePasswordChange(
  currentPassword?: unknown,
  newPassword?: unknown,
): { valid: boolean; error?: string } {
  if (typeof currentPassword !== "string" || !currentPassword) {
    return { valid: false, error: "Current password is required." };
  }
  if (typeof newPassword !== "string" || !newPassword || newPassword.length < 8) {
    return { valid: false, error: "New password must be at least 8 characters long." };
  }
  if (newPassword.length > 128) {
    return { valid: false, error: "New password cannot exceed 128 characters." };
  }
  if (currentPassword === newPassword) {
    return { valid: false, error: "New password must be different from current password." };
  }
  return { valid: true };
}

