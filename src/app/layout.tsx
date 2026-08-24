import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/core/theme/theme-provider";
import { getCurrentSession } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { eq } from "drizzle-orm";
import "./globals.css";

// Keep Inter via next/font for default rendering (prevents FOUC on first paint)
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const FONT_FAMILIES = {
  inter: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "Roboto, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  opensans: "'Open Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  lato: "Lato, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

type FontKey = keyof typeof FONT_FAMILIES;

function isFontKey(value: string): value is FontKey {
  return value in FONT_FAMILIES;
}

export const metadata: Metadata = {
  title: { default: "Ledgerly ERP", template: "%s · Ledgerly ERP" },
  description: "Compact, modern accounting for real businesses.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();

  // Read font/size from cookies first (fast path, no DB query)
  const cookieStore = await cookies();
  let fontKey: FontKey = "inter";
  let themeSize = "normal";

  const cookieFont = cookieStore.get("ui-font")?.value;
  const cookieSize = cookieStore.get("ui-size")?.value;
  if (cookieFont && isFontKey(cookieFont)) fontKey = cookieFont;
  if (cookieSize && ["small", "normal", "large"].includes(cookieSize)) themeSize = cookieSize;

  // If cookies are missing but user is logged in, hydrate cookies from DB
  if (session?.user && (!cookieFont || !cookieSize)) {
    const settings = await getSystemDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.user.id))
      .get();

    if (settings) {
      if (isFontKey(settings.themeFont)) fontKey = settings.themeFont;
      if (["small", "normal", "large"].includes(settings.themeSize)) themeSize = settings.themeSize;
    }
  }

  const fontFamily = FONT_FAMILIES[fontKey];

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-font={fontKey}
      data-size={themeSize}
      className={inter.variable}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-css-tags -- public/fonts/fonts.css is a static asset for self-hosted font fallbacks, not importable as a module */}
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body style={{ fontFamily }}>
        <ThemeProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
