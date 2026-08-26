const fs = require("fs");
const path = require("path");

const sourceModule = "src/modules/sales-invoices";
const targetModule = "src/modules/sales-quotes";
const targetRoute = "src/app/b/[businessId]/sales-quotes";
// Note: cloning modules requires massive find and replace.
// invoice -> quote, Invoice -> Quote, INVOICE -> QUOTE
// invoices -> quotes, Invoices -> Quotes, INVOICES -> QUOTES
// customerId, etc.

