import fs from "node:fs";
import ts from "typescript";

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}
const mutationName = /^(create|update|save|delete|void|cancel|close|post|issue|duplicate|batch|generateBatch|ensureDefaultDemo|apply|confirm|ignore|reset|start|complete|import|mark|finalize|reopen|set|toggle|recode|change|move|reorder|add|remove|upload|send|verifyAndSend)/;
const domainGuards = /\b(assertMutationPermission|assertSavePermission|assertBusinessAdministrator|assertCustomFieldWritePermission)\(/;
// Personal preferences are scoped to the current actor, not business administration capabilities.
const personal = new Set(["upsertPreferences", "clearPreferences"]);
let checked = 0;
const failures = [];
for (const file of walk("src/modules").filter(file => file.endsWith(".ts") && !file.endsWith("actions.ts"))) {
  const source = fs.readFileSync(file, "utf8"), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const node of ast.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.body || !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const name = node.name?.text ?? "", params = node.parameters.map(p => p.name.getText(ast));
    if (!mutationName.test(name) || !params.includes("businessId") || !params.includes("userId")) continue;
    const body = node.body.getText(ast);
    if (personal.has(name) && body.includes("assertMembership(")) continue;
    checked++;
    if (!domainGuards.test(body)) failures.push(`${file}: ${name} has no domain authorization guard`);
  }
}
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log(`Permission boundary coverage: ${checked} business command functions guarded. Runtime denial tests remain required.`);
