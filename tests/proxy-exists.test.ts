import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("proxy.ts must exist and export a proxy function", () => {
  const proxyPath = path.join(process.cwd(), "src", "proxy.ts");
  assert.ok(fs.existsSync(proxyPath), "src/proxy.ts was deleted!");
  
  const content = fs.readFileSync(proxyPath, "utf-8");
  assert.ok(content.includes("export function proxy"), "proxy.ts must export a 'proxy' function for Next.js 16+");
});
