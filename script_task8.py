import os
import re

for root, dirs, files in os.walk("src/app/b"):
    for file_name in files:
        if file_name == "loading.tsx":
            file_path = os.path.join(root, file_name)
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # extract label
            # e.g., Loading Sales... or Loading sales... or Loading Invoices...
            match = re.search(r"Loading (.*?)(?:\.|\u2026|<)", content)
            label = match.group(1) if match else "data"
            
            new_content = f'import {{ SectionLoading }} from "@/components/section-loading";\n\nexport default function Loading() {{\n  return <SectionLoading label="{label}" />;\n}}\n'
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
                
        elif file_name == "error.tsx":
            file_path = os.path.join(root, file_name)
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            # extract label
            # e.g., Failed to load Sales or Error loading Sales
            match = re.search(r"(?:Failed to load|Error loading) (.*?)<", content)
            label = match.group(1).strip() if match else "data"
            
            new_content = f'"use client";\nimport {{ SectionError }} from "@/components/section-error";\n\nexport default function ErrorBoundary({{ error, reset }}: {{ error: Error & {{ digest?: string }}; reset: () => void }}) {{\n  return <SectionError label="{label}" error={{error}} reset={{reset}} />;\n}}\n'
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
