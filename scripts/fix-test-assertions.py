import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('assert.equal(quote.amountsIncludeTax, 1);', 'assert.equal(quote.quote.amountsIncludeTax, true);')
c = c.replace('assert.equal(quote.subtotalMinor, 9000);', 'assert.equal(quote.quote.subtotalMinor, 9000);')
c = c.replace('assert.equal(quote.taxMinor, 450);', 'assert.equal(quote.quote.taxMinor, 450);')
c = c.replace('assert.equal(quote.totalMinor, 9450);', 'assert.equal(quote.quote.totalMinor, 9450);')

c = c.replace('assert.equal(order.salesQuoteId, quoteId);', 'assert.equal(order.order.salesQuoteId, quoteId);')
c = c.replace('assert.equal(order.amountsIncludeTax, 0);', 'assert.equal(order.order.amountsIncludeTax, false);')
c = c.replace('assert.equal(order.subtotalMinor, 8000);', 'assert.equal(order.order.subtotalMinor, 8000);')
c = c.replace('assert.equal(order.taxMinor, 400);', 'assert.equal(order.order.taxMinor, 400);')
c = c.replace('assert.equal(order.totalMinor, 8400);', 'assert.equal(order.order.totalMinor, 8400);')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
