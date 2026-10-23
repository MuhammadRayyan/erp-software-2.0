"use server";

import { completeInvitation } from "@/core/permissions/invitation-service";

export async function completeInvitationAction(input: {
  token: string;
  name: string;
  password: string;
  confirmPassword: string;
}) {
  const token = input.token?.trim();
  if (!token) {
    return { error: "Invitation token is missing." };
  }

  const name = input.name?.trim();
  if (!name || name.length < 2) {
    return { error: "Full name must be at least 2 characters long." };
  }

  const password = input.password;
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters long." };
  }

  if (password !== input.confirmPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    const res = await completeInvitation(token, name, password);
    return {
      success: true,
      email: res.email,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to complete account registration.",
    };
  }
}
