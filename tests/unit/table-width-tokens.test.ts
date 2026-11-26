import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");

/**
 * Arbitrary pixel min-widths that are intentionally kept. Key: path relative to
 * the repo root; value: the exact class strings allowed in that file.
 */
const ALLOWLIST: Record<string, string[]> = {
  // Notification count badge: pixel-tuned to match its h-[17px] circle.
  "src/components/app-shell/notification-bell.tsx": ["min-w-[17px]"],
};

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("UI uses named table-width tokens instead of arbitrary pixel min-widths", () => {
  const offenders: string[] = [];
  for (const file of listTsxFiles(srcDir)) {
    const rel = path.relative(rootDir, file).split(path.sep).join("/");
    const allowed = ALLOWLIST[rel] ?? [];
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/min-w-\[\d+px\]/g)) {
        if (!allowed.includes(match[0])) offenders.push(`${rel}:${index + 1} ${match[0]}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "Use min-w-table-{sm,md,lg,xl,2xl} for tables or a spacing-scale class (e.g. min-w-40) instead of min-w-[NNNpx]",
  );
});

test("globals.css defines the table-width tokens", () => {
  const css = fs.readFileSync(path.join(srcDir, "app/globals.css"), "utf8");
  for (const size of ["sm", "md", "lg", "xl", "2xl"]) {
    assert.match(css, new RegExp(`--container-table-${size}:\\s*[\\d.]+rem`), `missing --container-table-${size}`);
  }
});

test("every table using a width token is inside a horizontal scroll container", () => {
  const offenders: string[] = [];
  for (const file of listTsxFiles(srcDir)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const tableAt = line.search(/<table[^>]*min-w-table-/);
      if (tableAt === -1) return;
      const context = lines.slice(Math.max(0, index - 12), index).join("\n") + line.slice(0, tableAt);
      if (!/overflow-x-auto|overflow-auto|data-panel/.test(context)) {
        offenders.push(`${path.relative(rootDir, file)}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "Wrap wide tables in .data-panel or overflow-x-auto");
});
