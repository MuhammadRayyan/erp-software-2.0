const fs = require('fs');
let c = fs.readFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', 'utf-8');

c = c.replace(/availableProjects/g, 'projects');
c = c.replace(/defaultSalesAccountId/g, 'defaultSales');
c = c.replace(/itemId: "", /g, '');
c = c.replace(/\{baseEquivalentMinor != null && \([\s\S]*?<\/div>\s*\)\}/g, '');
c = c.replace(/<th className="min-w-\[150px\] py-3 text-left font-semibold text-muted-foreground">Item<\/th>/g, '');

const itemSelectStart = c.indexOf('<td>\\n                    <select aria-label={Line  inventory item');
if (itemSelectStart === -1) {
    const backupStart = c.indexOf('<select aria-label={Line  inventory item');
    if (backupStart !== -1) {
        let tdStart = c.lastIndexOf('<td>', backupStart);
        let tdEnd = c.indexOf('</td>', backupStart) + 5;
        c = c.substring(0, tdStart) + c.substring(tdEnd);
    }
}

const salesStart = c.indexOf('{lines[index]?.itemId ? (');
if (salesStart !== -1) {
    const tdStart = c.lastIndexOf('<td', salesStart);
    const tdEnd = c.indexOf('</td>', salesStart) + 5;
    const selectStrStart = c.indexOf('<select aria-label={Line  sales account', salesStart);
    const selectStrEnd = c.indexOf('</select>', selectStrStart) + 9;
    const justSelect = c.substring(selectStrStart, selectStrEnd);
    c = c.substring(0, tdStart) + '<td className="py-2">\\n                      ' + justSelect + '\\n                    </td>' + c.substring(tdEnd);
}

fs.writeFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', c);
