import { mkdirSync } from "node:fs";
import path from "node:path";

const configuredRoot = process.env.ERP_DATA_DIR ?? path.join(process.cwd(), "data");

export const DATA_ROOT = path.resolve(configuredRoot);
export const SYSTEM_DIRECTORY = path.join(DATA_ROOT, "system");
export const SYSTEM_DB_PATH = path.join(SYSTEM_DIRECTORY, "system.sqlite");
export const BUSINESSES_DIRECTORY = path.join(DATA_ROOT, "businesses");

export function ensureDataDirectories() {
  mkdirSync(SYSTEM_DIRECTORY, { recursive: true });
  mkdirSync(BUSINESSES_DIRECTORY, { recursive: true });
}

export function getBusinessPaths(directoryKey: string) {
  if (!/^[a-f0-9-]{36}$/i.test(directoryKey)) {
    throw new Error("Invalid trusted business directory key");
  }

  const directory = path.join(BUSINESSES_DIRECTORY, directoryKey);
  return {
    directory,
    database: path.join(directory, "business.sqlite"),
    attachments: path.join(directory, "attachments"),
  };
}
