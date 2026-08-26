const fs = require("fs");
const path = require("path");

const settingsDir = path.join(__dirname, "../src/app/b/[businessId]/settings");
const files = fs.readdirSync(settingsDir, { withFileTypes: true });

for (const dirent of files) {
  if (dirent.isDirectory()) {
    const pagePath = path.join(settingsDir, dirent.name, "page.tsx");
    if (fs.existsSync(pagePath)) {
      let content = fs.readFileSync(pagePath, "utf-8");
      
      // Match the entire pattern
      const regex = /<div className="page-container">\s*<Link href={`\/b\/\$\{businessId\}\/settings`} className="mb-5 inline-flex items-center gap-1\.5 text-\[13px\] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" \/> Settings<\/Link>\s*<div className="page-header"><div><h1 className="page-title">(.*?)<\/h1><p className="page-description">(.*?)<\/p><\/div><\/div>\s*([\s\S]*?)\s*<\/div>/;
      
      if (regex.test(content)) {
        const match = content.match(regex);
        const title = match[1];
        const description = match[2];
        const innerContent = match[3];

        // Replace imports
        content = content.replace(/import Link from "next\/link";\n/, "");
        content = content.replace(/import { ArrowLeft } from "lucide-react";\n/, "");
        content = `import { SettingsShell } from "@/components/settings-shell";\n` + content;
        
        // Replace return block
        const newReturnBlock = `<SettingsShell businessId={businessId} title="${title}" description="${description}">\n      ${innerContent}\n    </SettingsShell>`;
        content = content.replace(regex, newReturnBlock);

        fs.writeFileSync(pagePath, content);
        console.log(`Updated ${pagePath}`);
      }
    }
  }
}
