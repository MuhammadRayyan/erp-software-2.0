import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

test("Sprint 4: next.config.ts strips 'unsafe-eval' in production CSP and preserves it in non-production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const mod = await import("../../next.config");
  const config = mod.default;
  assert.ok(typeof config.headers === "function", "next.config.ts must export async headers()");

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const prodRuleSets = await config.headers();
    const prodHeaders = prodRuleSets.flatMap((entry) => entry.headers);
    const prodCsp = prodHeaders.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    assert.ok(prodCsp.includes("script-src 'self' 'unsafe-inline'"), "production CSP keeps expected script-src");
    assert.ok(!prodCsp.includes("'unsafe-eval'"), "production CSP must omit 'unsafe-eval'");
    assert.ok(prodCsp.includes("object-src 'self' blob:"), "production CSP must permit blob: <object> PDF previews");
    assert.ok(prodCsp.includes("frame-src 'self' blob: data:"), "production CSP keeps blob:/data: frame-src fallback");

    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const devRuleSets = await config.headers();
    const devHeaders = devRuleSets.flatMap((entry) => entry.headers);
    const devCsp = devHeaders.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    assert.ok(devCsp.includes("'unsafe-eval'"), "development CSP retains 'unsafe-eval' for React/Next dev tooling");
    assert.ok(devCsp.includes("object-src 'self' blob:"), "development CSP also permits blob: <object> PDF previews");
  } finally {
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
  }
});

test("Sprint 4: next.config.ts routes NEXT_DIST_DIR=.next-validate to tsconfig.validate.json", async () => {
  const originalDistDir = process.env.NEXT_DIST_DIR;
  const configHref = pathToFileURL(path.join(process.cwd(), "next.config.ts")).href;
  try {
    process.env.NEXT_DIST_DIR = ".next-validate";
    const validateMod = await import(`${configHref}?validate=${Date.now()}`);
    assert.equal(validateMod.default.distDir, ".next-validate");
    assert.equal(validateMod.default.typescript?.tsconfigPath, "tsconfig.validate.json");

    delete process.env.NEXT_DIST_DIR;
    const defaultMod = await import(`${configHref}?default=${Date.now()}`);
    assert.equal(defaultMod.default.distDir, undefined);
    assert.equal(defaultMod.default.typescript?.tsconfigPath, undefined);
  } finally {
    if (originalDistDir === undefined) {
      delete process.env.NEXT_DIST_DIR;
    } else {
      process.env.NEXT_DIST_DIR = originalDistDir;
    }
  }
});

test("Sprint 4: tsconfig.json and tsconfig.validate.json isolate .next and .next-validate scopes", () => {
  const root = process.cwd();
  const baseTs = JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8")) as {
    include: string[];
    exclude: string[];
  };
  const valTs = JSON.parse(readFileSync(path.join(root, "tsconfig.validate.json"), "utf8")) as {
    extends: string;
    include: string[];
    exclude: string[];
  };

  assert.ok(!baseTs.include.includes("**/*.ts"), "base tsconfig.json avoids catch-all **/*.ts");
  assert.ok(!baseTs.include.some((g) => g.includes(".next-validate")), "base tsconfig.json must not include .next-validate");
  assert.ok(baseTs.exclude.includes(".next-validate"), "base tsconfig.json excludes .next-validate");
  assert.ok(baseTs.include.includes("tests/**/*.ts"), "base tsconfig.json covers reorganized tests/**");

  assert.equal(valTs.extends, "./tsconfig.json");
  assert.ok(valTs.include.includes(".next-validate/types/**/*.ts"));
  assert.ok(valTs.exclude.includes(".next"));
});

test("Sprint 4: tests/ is organized by domain with zero root *.test.ts orphans and e2e moved under tests/e2e", () => {
  const root = process.cwd();
  assert.equal(existsSync(path.join(root, "e2e")), false, "legacy root e2e/ directory must be removed");
  const rootEntries = readdirSync(path.join(root, "tests"));
  assert.deepEqual(
    rootEntries.filter((e) => e.endsWith(".test.ts")),
    [],
    "no orphan *.test.ts files should remain at tests/ root",
  );
  for (const dir of ["unit", "accounting", "platform", "integration", "e2e"]) {
    assert.ok(existsSync(path.join(root, "tests", dir)), `tests/${dir} must exist`);
  }
  assert.ok(existsSync(path.join(root, "tests/e2e/acceptance.spec.ts")));
});

test("Sprint 4: documentation follows the 5-document hierarchy with valid relative links", () => {
  const root = process.cwd();
  assert.equal(existsSync(path.join(root, "SYSTEM_DOSSIER.md")), false, "SYSTEM_DOSSIER.md must be archived under docs/history/");
  assert.deepEqual(
    readdirSync(path.join(root, "docs")).sort(),
    ["ARCHITECTURE.md", "CHANGELOG.md", "DEPLOYMENT.md", "DESIGN_SYSTEM.md", "history"],
  );

  const docsToCheck = [
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/DESIGN_SYSTEM.md",
    "docs/DEPLOYMENT.md",
    "docs/CHANGELOG.md",
    "docs/history/README.md",
    ".agents/skills/oracle-cloud-deployment/SKILL.md",
  ];
  for (const relFile of docsToCheck) {
    const absFile = path.join(root, relFile);
    const content = readFileSync(absFile, "utf8");
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const targetRaw = match[1].split("#")[0].trim();
      if (!targetRaw || targetRaw.startsWith("http://") || targetRaw.startsWith("https://")) continue;
      const resolved = path.resolve(path.dirname(absFile), targetRaw);
      assert.ok(existsSync(resolved), `${relFile} contains broken relative link ${match[1]}`);
    }
  }
});

test("Sprint 4: scripts/verify-html-pdf.ts closes the Chromium pool via closeHtmlPdfBrowser() in finally", (ctx) => {
  const scriptPath = path.join(process.cwd(), "scripts/verify-html-pdf.ts");
  const source = readFileSync(scriptPath, "utf8");
  const ast = ts.createSourceFile(scriptPath, source, ts.ScriptTarget.Latest, true);

  let importsCloseHtmlPdfBrowser = false;
  let callsCloseInFinally = false;

  function containsCloseCall(node: ts.Node): boolean {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "closeHtmlPdfBrowser"
    ) {
      return true;
    }
    let found = false;
    ts.forEachChild(node, (child) => {
      if (!found && containsCloseCall(child)) {
        found = true;
      }
    });
    return found;
  }

  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.includes("browser-pool")
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if (el.name.text === "closeHtmlPdfBrowser") {
            importsCloseHtmlPdfBrowser = true;
          }
        }
      }
    }
    if (ts.isTryStatement(node) && node.finallyBlock && containsCloseCall(node.finallyBlock)) {
      callsCloseInFinally = true;
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);

  assert.ok(
    importsCloseHtmlPdfBrowser,
    "scripts/verify-html-pdf.ts must import closeHtmlPdfBrowser from browser-pool",
  );
  assert.ok(
    callsCloseInFinally,
    "scripts/verify-html-pdf.ts must call closeHtmlPdfBrowser() inside a finally block",
  );

  const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-html-pdf.ts"], {
    cwd: process.cwd(),
    timeout: 15_000,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    const output = `${run.stdout}\n${run.stderr}`;
    if (/Failed to launch|No usable sandbox|Could not find Chrome|error while loading shared libraries/i.test(output)) {
      ctx.skip(`Chromium unavailable in environment: ${output.trim()}`);
      return;
    }
    assert.fail(
      `scripts/verify-html-pdf.ts failed or hung (status=${String(run.status)}, error=${String(run.error?.message ?? "")}): ${output}`,
    );
  }
  assert.match(run.stdout, /generated a valid \d+-byte PDF/);
});
