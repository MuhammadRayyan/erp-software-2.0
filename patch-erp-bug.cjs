const fs = require('fs');

let c = fs.readFileSync('src/modules/inventory/delivery-note-form.tsx', 'utf8');

// The bug is that `disabled={!!initial.salesInvoiceId}` prevents the form from submitting the value.
// Instead of disabling the SelectNative directly, we can use a hidden input for the value if it's locked.
// Actually, a simpler fix for React Hook Form is to just not disable it, but maybe visually lock it,
// or just tell React Hook Form to keep disabled values.
// In RHF, we can just remove the `disabled` attribute from the SelectNative and let it be editable,
// or we can just replace `disabled={!!initial.salesInvoiceId}` with nothing, or maybe just `className="pointer-events-none opacity-60" readOnly`.

c = c.replace(/disabled=\{!!initial\.salesInvoiceId\}/, 'className={!!initial.salesInvoiceId ? "pointer-events-none opacity-60" : ""}');

fs.writeFileSync('src/modules/inventory/delivery-note-form.tsx', c);

console.log('done');
