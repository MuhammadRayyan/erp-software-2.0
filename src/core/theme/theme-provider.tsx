"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { z } from "zod";

if (typeof window !== "undefined") {
  z.config({ jitless: true });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
