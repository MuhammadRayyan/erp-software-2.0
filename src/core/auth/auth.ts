import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getSystemSqlite } from "@/core/db/system";
import { resolveBetterAuthSecret } from "./auth-config";

export const auth = betterAuth({
  appName: "Ledgerly ERP",
  database: getSystemSqlite(),
  secret: resolveBetterAuthSecret(),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins: [nextCookies()],
});
