
import fs from "fs";

// --- Layer 8: format.ts ---
const formatTsPath = "src/core/format.ts";
let formatTs = fs.readFileSync(formatTsPath, "utf8");
if (!formatTs.includes("EMPTY_CELL")) {
  formatTs += `\nexport const EMPTY_CELL = "—";\nexport function formatOptional(value?: string | null): string {\n  return value ?? EMPTY_CELL;\n}\n`;
  fs.writeFileSync(formatTsPath, formatTs);
  console.log("Updated format.ts");
}

// --- Layer 1: globals.css ---
const globalsCssPath = "src/app/globals.css";
let globalsCss = fs.readFileSync(globalsCssPath, "utf8");

// Remove old data-table rules
const dataTableRegex = /\.data-table\s*\{[^}]+\}\s*\.data-table\s+th\s*\{[^}]+\}\s*\.data-table\s+td\s*\{[^}]+\}\s*\.data-table\s+tbody\s+tr\s*\{[^}]+\}\s*\.data-table\s+tbody\s+tr:hover\s*\{[^}]+\}\s*\.data-table\s+tbody\s+tr:active\s*\{[^}]+\}/g;
globalsCss = globalsCss.replace(dataTableRegex, "");
globalsCss = globalsCss.replace(/\.data-panel\s*\{[^}]+\}/g, "");

// Add new data-table rules
const newRules = `
.data-panel { 
  overflow-y: auto; 
  overflow-x: auto; 
  max-height: var(--table-max-height, 100%); 
  border: 1px solid var(--border); 
  border-radius: 8px; 
  background: var(--surface-raised); 
}
.data-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.data-table th { 
  padding: 0 12px; 
  background: var(--surface); 
  color: var(--muted-foreground); 
  font-size: 12px; 
  font-weight: 600; 
  text-align: left; 
  border-bottom: 1px solid var(--border-strong); 
  position: sticky; 
  top: 0; 
  z-index: 1; 
}
.data-table td { 
  border-top: 1px solid var(--border); 
  padding: 0 12px; 
}
/* Density overrides */
.data-table[data-density="compact"] td, .data-table[data-density="compact"] th { height: 40px; }
.data-table[data-density="default"] td, .data-table[data-density="default"] th,
.data-table td, .data-table th { height: 48px; } /* default fallback */
.data-table[data-density="comfortable"] td, .data-table[data-density="comfortable"] th { height: 56px; }

/* Numeric and wrap utilities handled via Tailwind classes in DataTable, but adding these just in case */
.col-numeric { font-variant-numeric: tabular-nums; text-align: right; }
.col-wrap { white-space: normal; }
.col-nowrap { white-space: nowrap; }

/* Sticky first column */
.data-table th.sticky-col {
  position: sticky; 
  left: 0; 
  z-index: 3; /* above other headers */
  background: var(--surface);
  box-shadow: inset -1px 0 0 var(--border-strong);
}
.data-table td.sticky-col {
  position: sticky; 
  left: 0; 
  z-index: 2; 
  background: var(--surface-raised);
  box-shadow: inset -1px 0 0 var(--border);
}

/* Single hairline & hover (no zebra) */
.data-table tbody tr { transition: background-color 120ms ease; }
.data-table tbody tr:hover td { background: var(--surface-muted); }
.data-table tbody tr:active td { background: color-mix(in srgb, var(--surface-muted) 80%, var(--border)); }

/* Hover reveal for row actions */
.data-table tbody tr .row-actions { opacity: 0; transition: opacity 120ms ease; }
.data-table tbody tr:hover .row-actions,
.data-table tbody tr:focus-within .row-actions { opacity: 1; }
`;

// Insert the new rules before the @media queries
globalsCss = globalsCss.replace(/@media \(max-width: 767px\)/, newRules + "\n@media (max-width: 767px)");
fs.writeFileSync(globalsCssPath, globalsCss);
console.log("Updated globals.css");

