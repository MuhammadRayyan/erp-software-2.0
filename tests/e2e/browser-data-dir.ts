import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Disposable data directory shared by a Playwright run and its web server.
 * Workers inherit the env set here, so only the main process creates it.
 * ERP_BROWSER_DATA_DIR_OWNED marks a directory this run created, so the
 * global teardown never deletes a directory passed in by the caller.
 */
export function browserDataDir() {
  if (!process.env.ERP_BROWSER_DATA_DIR) {
    process.env.ERP_BROWSER_DATA_DIR = mkdtempSync(path.join(tmpdir(), "erp-browser-"));
    process.env.ERP_BROWSER_DATA_DIR_OWNED = "1";
  }
  const root = process.env.ERP_BROWSER_DATA_DIR;
  process.env.ERP_BROWSER_META = path.join(root, "fixture.json");
  return root;
}

/** The web server's own temp files (Chromium PDF rendering) stay inside the data directory. */
export function browserServerTmpDir(root: string) {
  const dir = path.join(root, "tmp");
  mkdirSync(dir, { recursive: true });
  return dir;
}
