
import fs from "fs";
let content = fs.readFileSync("src/components/ui/data-table.tsx", "utf8");
content = content.replace(/className={classes.trim()}/, "className={`group ${classes.trim()}`.trim()}");
fs.writeFileSync("src/components/ui/data-table.tsx", content);

