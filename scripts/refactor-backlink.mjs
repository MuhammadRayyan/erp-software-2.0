import fs from "fs";
import path from "path";

const root = path.join(process.cwd(), "src/app/b");

function findFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, files);
    } else if (fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = findFiles(root);

let changed = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, "utf8");
  
  // Find <Link href={...} ...><ArrowLeft className="..." /> Text</Link>
  const linkRegex = /<Link\s+href=({(?:`.+?`|'.+?'|".+?"|[^}]+)}|"[^"]+")\s+className="[^"]*"\s*>\s*<ArrowLeft[^>]*\/>\s*([^<]+)<\/Link>/g;
  
  if (linkRegex.test(content)) {
    content = content.replace(linkRegex, (match, hrefFull, text) => {
      return `<BackLink href=${hrefFull}>${text.trim()}</BackLink>`;
    });
    
    // Also add the import if it's missing
    if (!content.includes('import { BackLink }')) {
      // Find the last import
      const lastImportIndex = content.lastIndexOf("import ");
      if (lastImportIndex !== -1) {
        const endOfLine = content.indexOf("\n", lastImportIndex);
        content = content.slice(0, endOfLine + 1) + `import { BackLink } from "@/components/back-link";\n` + content.slice(endOfLine + 1);
      } else {
        content = `import { BackLink } from "@/components/back-link";\n` + content;
      }
    }
    
    // Remove ArrowLeft import if it's no longer used
    if (!content.match(/<ArrowLeft/)) {
      content = content.replace(/ArrowLeft,?\s*/g, '');
      // Clean up empty lucide-react imports
      content = content.replace(/import\s*{\s*}\s*from\s*["']lucide-react["'];?\n/g, '');
    }

    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
    changed++;
  }
}

console.log(`Refactored ${changed} files.`);
