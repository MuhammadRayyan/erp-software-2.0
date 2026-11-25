"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { z } from "zod";
import { UnsavedChangesModalHost } from "@/components/unsaved-changes-modal-host";

if (typeof window !== "undefined") {
  z.config({ jitless: true });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <UnsavedChangesModalHost />
    </NextThemesProvider>
  );
}
