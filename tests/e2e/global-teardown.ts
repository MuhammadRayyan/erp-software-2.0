import { rmSync } from "node:fs";

/** Removes the disposable data directory created by `browserDataDir()`. */
export default function globalTeardown() {
  const root = process.env.ERP_BROWSER_DATA_DIR;
  if (!root || process.env.ERP_BROWSER_DATA_DIR_OWNED !== "1") return;
  rmSync(root, { recursive: true, force: true });
}
