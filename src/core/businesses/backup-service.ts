import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { z } from "zod";
import Database from "better-sqlite3";
import { closeBusinessConnection, getBusinessDb, openBusinessDatabase } from "@/core/db/business";
import { getBusinessPaths } from "@/core/db/paths";
import { businesses, memberships } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { getBusinessForUser } from "./business-service";

const legacyManifestSchema = z.object({
  formatVersion: z.literal(1),
  applicationVersion: z.string(),
  originalBusinessName: z.string().min(1).max(100),
  exportedAt: z.iso.datetime(),
  databaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const manifestSchema = z.discriminatedUnion("formatVersion", [
  legacyManifestSchema,
  z.object({
    formatVersion: z.literal(2),
    applicationVersion: z.string(),
    originalBusinessName: z.string().min(1).max(100),
    exportedAt: z.iso.datetime(),
    databaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
    country: z.string().min(2).max(80),
    baseCurrencyCode: z.string().length(3),
    financialYearStartMonth: z.number().int().min(1).max(12),
    currencyConfiguration: z.array(z.object({
      code: z.string().length(3),
      name: z.string(),
      symbol: z.string().nullable(),
      minorUnit: z.number().int().min(0).max(6),
      isBase: z.boolean(),
      isActive: z.boolean(),
    })),
  }),
]);

function checksum(data: Buffer | Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

function addAttachments(zip: JSZip, root: string, current = root) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) addAttachments(zip, root, fullPath);
    else if (entry.isFile()) zip.file(`attachments/${path.relative(root, fullPath).replaceAll("\\", "/")}`, readFileSync(fullPath));
  }
}

export async function exportBusinessBackup(businessId: string, userId: string) {
  const access = getBusinessForUser(businessId, userId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const context = getBusinessDb(businessId, userId);
  const temporaryDatabase = path.join(context.paths.directory, `.backup-${randomUUID()}.sqlite`);
  try {
    await context.sqlite.backup(temporaryDatabase);
    const portable = new Database(temporaryDatabase);
    try {
      portable.prepare(`
        UPDATE business_einvoice_settings SET asp_provider_key = NULL, asp_environment = 'disabled'
        WHERE id = 'default'
      `).run();
    } finally {
      portable.close();
    }
    const database = readFileSync(temporaryDatabase);
    const currencyConfiguration = context.sqlite.prepare(`
      SELECT code, name, symbol, minor_unit, is_base, is_active FROM currencies ORDER BY code
    `).all() as Array<{
      code: string; name: string; symbol: string | null; minor_unit: number;
      is_base: number; is_active: number;
    }>;
    const manifest = {
      formatVersion: 2 as const,
      applicationVersion: "0.1.0",
      originalBusinessName: access.business.name,
      exportedAt: new Date().toISOString(),
      databaseSha256: checksum(database),
      country: access.business.country,
      baseCurrencyCode: access.business.currency,
      financialYearStartMonth: access.business.financialYearStartMonth,
      currencyConfiguration: currencyConfiguration.map((currency) => ({
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        minorUnit: currency.minor_unit,
        isBase: Boolean(currency.is_base),
        isActive: Boolean(currency.is_active),
      })),
    };
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("business.sqlite", database);
    addAttachments(zip, context.paths.attachments);
    zip.folder("attachments");
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  } finally {
    rmSync(temporaryDatabase, { force: true });
  }
}

export async function importBusinessBackup(buffer: ArrayBuffer, userId: string) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const manifestFile = zip.file("manifest.json");
  const databaseFile = zip.file("business.sqlite");
  if (!manifestFile || !databaseFile) throw new Error("Backup must contain manifest.json and business.sqlite");
  const manifest = manifestSchema.parse(JSON.parse(await manifestFile.async("string")));
  const database = await databaseFile.async("nodebuffer");
  if (checksum(database) !== manifest.databaseSha256) throw new Error("Backup database checksum does not match its manifest");

  const id = randomUUID();
  const directoryKey = randomUUID();
  const paths = getBusinessPaths(directoryKey);
  const now = new Date().toISOString();
  mkdirSync(paths.attachments, { recursive: true });
  writeFileSync(paths.database, database);

  try {
    const context = openBusinessDatabase(directoryKey);
    context.sqlite.prepare("SELECT 1 FROM customers LIMIT 1").all();
    if (manifest.formatVersion === 2) {
      const restoredBase = context.sqlite.prepare(`
        SELECT base_currency_code FROM business_currency_settings WHERE id = 'default'
      `).get() as { base_currency_code: string } | undefined;
      if (restoredBase?.base_currency_code !== manifest.baseCurrencyCode) {
        throw new Error("Backup base-currency metadata does not match its business database.");
      }
    }
    context.sqlite.prepare(`
      UPDATE business_einvoice_settings
      SET asp_provider_key = NULL, asp_environment = 'disabled', updated_at = ?
      WHERE id = 'default'
    `).run(now);
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.startsWith("attachments/")) continue;
      const relative = name.slice("attachments/".length).replaceAll("\\", "/");
      if (!relative || relative.split("/").includes("..")) throw new Error("Backup contains an invalid attachment path");
      const destination = path.resolve(paths.attachments, relative);
      if (!destination.startsWith(`${path.resolve(paths.attachments)}${path.sep}`)) throw new Error("Backup attachment escaped its directory");
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, await entry.async("nodebuffer"));
    }
    getSystemDb().transaction((tx) => {
      tx.insert(businesses)
        .values({
          id,
          name: `${manifest.originalBusinessName} (Imported)`,
          country: manifest.formatVersion === 2 ? manifest.country : "United Arab Emirates",
          currency: manifest.formatVersion === 2 ? manifest.baseCurrencyCode : "AED",
          financialYearStartMonth: manifest.formatVersion === 2 ? manifest.financialYearStartMonth : 1,
          directoryKey,
          archived: false,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        })
        .run();
      tx.insert(memberships)
        .values({ id: randomUUID(), businessId: id, userId, role: "administrator", modulesJson: "[]", createdAt: now })
        .run();
    });
    return id;
  } catch (error) {
    closeBusinessConnection(directoryKey);
    getSystemDb().delete(businesses).where(eq(businesses.id, id)).run();
    rmSync(paths.directory, { recursive: true, force: true });
    throw error;
  }
}
