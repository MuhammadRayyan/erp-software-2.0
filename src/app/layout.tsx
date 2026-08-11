import type { Metadata } from "next";
import { Inter, Roboto, Open_Sans, Lato } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/core/theme/theme-provider";
import { getCurrentSession } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { eq } from "drizzle-orm";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const roboto = Roboto({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-roboto" });
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans" });
const lato = Lato({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-lato" });

export const metadata: Metadata = {
  title: { default: "Ledgerly ERP", template: "%s · Ledgerly ERP" },
  description: "Compact, modern accounting for real businesses.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  
  let themeFont = "inter";
  let themeSize = "normal";

  if (session?.user) {
    const settings = await getSystemDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.user.id))
      .get();
    
    if (settings) {
      themeFont = settings.themeFont;
      themeSize = settings.themeSize;
    }
  }

  return (
    <html lang="en" suppressHydrationWarning data-font={themeFont} data-size={themeSize} className={`${inter.variable} ${roboto.variable} ${openSans.variable} ${lato.variable}`}>
      <body>
        <ThemeProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
