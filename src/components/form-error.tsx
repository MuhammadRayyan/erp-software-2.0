"use client";

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <FormError message={message} />
  );
}

