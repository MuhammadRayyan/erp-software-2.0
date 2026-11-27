import fs from "node:fs";
import ts from "typescript";

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}
const mutationName = /^(create|update|save|delete|void|cancel|close|post|issue|duplicate|batch|generateBatch|ensureDefaultDemo|apply|confirm|ignore|reset|start|complete|import|mark|finalize|reopen|set|toggle|recode|change|move|reorder|add|remove|upload|send|verifyAndSend)/;
const domainGuards = /\b(assertMutationPermission|assertSavePermission|assertBusinessAdministrator|assertCustomFieldWritePermission)\(/;
// Personal preferences and actor-scoped notifications are scoped to the current actor, not business administration capabilities.
const personal = new Set(["upsertPreferences", "clearPreferences", "markNotificationRead", "markAllNotificationsRead"]);

/** "@/modules/x/y" or "./y" → the scanned "src/modules/x/y.ts" path, if any. */
function resolveImport(fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith(".")) base = new URL(specifier, `file:///${fromFile}`).pathname.slice(1);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) if (fs.existsSync(candidate)) return candidate;
  return null;
}

const files = walk("src/modules").filter(file => file.endsWith(".ts") && !file.endsWith("actions.ts"));
const commands = [];
// Exported functions whose own body asserts a domain guard, keyed "file#name".
const directlyGuarded = new Set();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8"), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  // Local name → "file#exportedName" for named imports of scanned modules.
  const imports = new Map();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const bindings = node.importClause?.namedBindings;
    if (node.importClause?.isTypeOnly || !bindings || !ts.isNamedImports(bindings)) continue;
    const target = resolveImport(file, node.moduleSpecifier.text);
    if (!target) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) imports.set(element.name.text, `${target}#${(element.propertyName ?? element.name).text}`);
    }
  }
  for (const node of ast.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.body || !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const name = node.name?.text ?? "", params = node.parameters.map(p => p.name.getText(ast));
    const bodyText = node.body.getText(ast);
    if (domainGuards.test(bodyText)) directlyGuarded.add(`${file}#${name}`);
    if (!mutationName.test(name) || !params.includes("businessId") || !params.includes("userId")) continue;
    if (personal.has(name) && bodyText.includes("assertMembership(")) continue;
    commands.push({ file, name, body: node.body, bodyText, imports });
  }
}

/**
 * A command is guarded when its body asserts a domain guard itself, or when it
 * delegates to an imported exported function that does (e.g. a document
 * service calling the shared document engine). Delegation is followed one
 * level only, so every guard stays one hop from the command it protects.
 */
function delegatesToGuardedCommand(command) {
  let found = false;
  const visit = node => {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const target = command.imports.get(node.expression.text);
      if (target && directlyGuarded.has(target)) { found = true; return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(command.body);
  return found;
}

let delegated = 0;
const failures = [];
for (const command of commands) {
  if (domainGuards.test(command.bodyText)) continue;
  if (delegatesToGuardedCommand(command)) { delegated++; continue; }
  failures.push(`${command.file}: ${command.name} has no domain authorization guard`);
}
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log(`Permission boundary coverage: ${commands.length} business command functions guarded (${delegated} by delegating to a guarded command). Runtime denial tests remain required.`);
