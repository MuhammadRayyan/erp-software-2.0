"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { z } from "zod";
import { UnsavedChangesModalHost } from "@/components/unsaved-changes-modal-host";

if (typeof window !== "undefined") {
  z.config({ jitless: true });
}

export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      {children}
      <UnsavedChangesModalHost />
    </NextThemesProvider>
  );
}
