const fs = require('fs');
let content = fs.readFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', 'utf-8');
let invoiceContent = fs.readFileSync('src/modules/sales-invoices/invoice-form.tsx', 'utf-8');
const startStr = '<div className=\"mb-3 flex flex-wrap items-end justify-between gap-3\">';
const invoiceStart = invoiceContent.indexOf(startStr);
const invoiceEndMatch = invoiceContent.match(/<\/dl>\s*<\/div>\s*<\/section>/);
let newSection = invoiceContent.substring(invoiceStart, invoiceEndMatch.index + invoiceEndMatch[0].length);

const myStart = content.indexOf(startStr);
const myEndMatch = content.match(/<\/dl>\s*<\/section>/);

if (myStart !== -1 && myEndMatch) {
  content = content.substring(0, myStart) + newSection + content.substring(myEndMatch.index + myEndMatch[0].length);
  fs.writeFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', content);
  console.log('Replaced section!');
} else {
  console.log('Could not find section boundaries');
}
