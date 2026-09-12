const fs = require("node:fs");
const file = "scripts/test-email.ts";
if (fs.existsSync(file)) fs.unlinkSync(file);
