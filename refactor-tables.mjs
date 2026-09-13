
import fs from "fs";
import path from "path";

const dir = "src/modules";
const wideTables = [
  "invoice-table.tsx", "purchase-invoice-table.tsx",
  "sales-order-table.tsx", "purchase-order-table.tsx",
  "credit-note-table.tsx", "debit-note-table.tsx"
];

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const name = dir + "/" + file;
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else if (name.endsWith("-table.tsx")) {
      files.push(name);
    }
  }
  return files;
}

const tableFiles = getFiles(dir);

for (const file of tableFiles) {
  let content = fs.readFileSync(file, "utf8");
  const fileName = path.basename(file);

  // 1 & 2. Add imports
  if (!content.includes("DensityToggle")) {
    content = content.replace(/(import .* from ".*";\n)(?!import)/, `$1import { DensityToggle } from "@/components/density-toggle";\nimport { useTableDensity } from "@/components/use-table-density";\n`);
  }

  // 3. Call useTableDensity
  if (!content.includes("useTableDensity(businessId)")) {
    // find the start of the component. usually export function XXXTable({ businessId
    content = content.replace(/(export function [a-zA-Z0-9_]+\(\{[\s\S]*?businessId,[\s\S]*?\}\) \{)/, `$1\n  const { density } = useTableDensity(businessId);\n`);
  }

  // 4 & 5. DataTable props
  const isWide = wideTables.includes(fileName);
  if (!content.includes("density={density}")) {
    const pinStr = isWide ? `\n        pinFirstColumn` : "";
    content = content.replace(/<DataTable([^>]*?table=\{table\})/, `<DataTable$1\n        density={density}${pinStr}`);
  }

  // 6. Numeric meta
  content = content.replace(/meta:\s*\{\s*className:\s*"text-right"\s*\}/g, `meta: { numeric: true }`);
  // also if they manually put text-right in a cell, although they usually do it in meta
  
  // 7. Wrap meta for names
  content = content.replace(/(accessorKey:\s*"(customer_name|supplier_name|description)",\s*header:\s*".*?",)/g, `$1\n        meta: { wrap: true },`);

  // 8. Row actions
  if (!content.includes(`className="row-actions"`)) {
    // find the actions cell
    // cell: ({ row }: any) => ( <Button ... ) or similar
    content = content.replace(/(id:\s*"actions"[\s\S]*?cell:\s*\(\{.*?\}\s*=>\s*\(\s*)(<Button[\s\S]*?<\/Button>)/g, `$1<div className="row-actions flex items-center justify-end">$2</div>`);
  }

  // 9. Density toggle next to dropdown
  if (!content.includes("<DensityToggle")) {
    content = content.replace(/\{dropdown\}/g, `<div className="ml-auto flex items-center gap-2">\n          <DensityToggle businessId={businessId} />\n          {dropdown}\n        </div>`);
  }

  fs.writeFileSync(file, content);
  console.log("Refactored", fileName);
}

