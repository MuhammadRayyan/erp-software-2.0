import { test } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("src/middleware.ts exists and exports middleware", async () => {
  const middlewarePath = path.join(process.cwd(), "src", "middleware.ts");
  assert.ok(existsSync(middlewarePath), "src/middleware.ts must exist (F1 regression guard)");

  const content = await readFile(middlewarePath, "utf8");
  assert.ok(
    /export\s+async\s+function\s+middleware\b/.test(content) ||
    /export\s+const\s+middleware\s*=/.test(content),
    "src/middleware.ts must export a function named 'middleware'"
  );
  assert.ok(
    /export\s+const\s+config\s*=/.test(content),
    "src/middleware.ts must export a config object with matcher"
  );
});
