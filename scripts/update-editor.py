import os

filepath = "src/modules/document-templates/template-editor.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

upload_fn = """
  const handleImageUpload = (key: keyof TemplateSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      update(key, event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
"""

c = c.replace('const [previewing, setPreviewing] = useState(false);', 'const [previewing, setPreviewing] = useState(false);\n' + upload_fn)

image_inputs = """
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="logoUrl">Logo</Label>
                <div className="flex gap-2">
                  <Input
                    id="logoUrl"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload("logoUrl")}
                  />
                  {settings.logoUrl && (
                    <Button type="button" variant="ghost" onClick={() => update("logoUrl", null)}>Clear</Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="headerImageUrl">Header Image (Full Width)</Label>
                <div className="flex gap-2">
                  <Input
                    id="headerImageUrl"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload("headerImageUrl")}
                  />
                  {settings.headerImageUrl && (
                    <Button type="button" variant="ghost" onClick={() => update("headerImageUrl", null)}>Clear</Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="footerImageUrl">Footer Image (Full Width)</Label>
                <div className="flex gap-2">
                  <Input
                    id="footerImageUrl"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload("footerImageUrl")}
                  />
                  {settings.footerImageUrl && (
                    <Button type="button" variant="ghost" onClick={() => update("footerImageUrl", null)}>Clear</Button>
                  )}
                </div>
              </div>
"""

old_logo_input = """
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="logoUrl">Logo URL (optional)</Label>
                <Input
                  id="logoUrl"
                  value={settings.logoUrl ?? ""}
                  onChange={(e) => update("logoUrl", e.target.value || null)}
                  placeholder="https://example.com/logo.png"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Advanced HTML</p>
                  <p className="text-xs text-muted-foreground">Select &quot;Custom HTML&quot; to write your own structure.</p>
                </div>
              </div>
"""

c = c.replace(old_logo_input.strip(), image_inputs.strip())

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
