import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/core/theme/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ledgerly ERP", template: "%s · Ledgerly ERP" },
  description: "Compact, modern accounting for real businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
