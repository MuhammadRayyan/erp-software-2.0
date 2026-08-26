const fs = require('fs');
let c = fs.readFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', 'utf-8');

c = c.replace(/<td>\s*<select aria-label=\{Line \$\{index \+ 1\} inventory item\}[\s\S]*?<\/select>\s*<\/td>/, '');

const salesAccountOld = /\{lines\[index\]\?\.itemId \? \([\s\S]*?\) : \([\s\S]*?<select aria-label=\{Line \$\{index \+ 1\} sales account\} ([\s\S]*?)<\/select>\s*\)\}/;
c = c.replace(salesAccountOld, '<select aria-label={Line  sales account} </select>');

fs.writeFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', c);
