import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/core/db/system-schema.ts",
  out: "./drizzle/system",
  dbCredentials: { url: process.env.ERP_DATA_DIR ? `${process.env.ERP_DATA_DIR}/system/system.sqlite` : "./data/system/system.sqlite" },
});
