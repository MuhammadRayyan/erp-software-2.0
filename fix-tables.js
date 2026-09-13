const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/modules/**/*-table.tsx');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // 1. Remove unused ColumnDef import
  content = content.replace(/type LegacyColumnDef as ColumnDef,\s*/, '');
  content = content.replace(/,\s*type LegacyColumnDef as ColumnDef/, '');
  content = content.replace(/type LegacyColumnDef as ColumnDef/, '');

  // 2. Add onClearFilters if clearFilters exists
  if (content.includes('clearFilters') && content.includes('<DataTable')) {
    // some tables have clearFilters but don't pass it to DataTable
    if (!content.includes('onClearFilters={clearFilters}')) {
      content = content.replace(/<DataTable([^>]+)\/>/s, (match, p1) => {
        return `<DataTable${p1} onClearFilters={clearFilters}\n    />`;
      });
    }
  }

  fs.writeFileSync(file, content);
}
console.log('Fixed tables!');
