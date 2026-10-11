"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun, TableProperties, Type, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTableDensity, type TableDensity } from "@/components/use-table-density";
import { upsertUserSettings } from "./actions";

export function AppearanceForm({ initialFont, initialSize }: { initialFont: string; initialSize: string }) {
  const [isPending, startTransition] = useTransition();
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useTableDensity();
  const [selectedFont, setSelectedFont] = useState(initialFont);
  const [selectedSize, setSelectedSize] = useState(initialSize);

  const handleSave = (formData: FormData) => {
    const font = (formData.get("themeFont") as string) || selectedFont;
    const size = (formData.get("themeSize") as string) || selectedSize;

    startTransition(async () => {
      const result = await upsertUserSettings(font, size);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Appearance settings updated successfully.");
      }
    });
  };

  return (
    <form action={handleSave} className="space-y-8 max-w-4xl">
      {/* Live Preview Card */}
      <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-xs">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Live Interface Preview
        </span>
        <div className="mt-3 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="font-semibold text-foreground">INV-2026-0042</p>
              <p className="text-xs text-muted-foreground">Acme Industrial Equipment LLC</p>
            </div>
            <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              Paid • AED 12,450.00
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Font: <strong className="text-foreground capitalize">{selectedFont}</strong></span>
            <span>Scaling: <strong className="text-foreground capitalize">{selectedSize}</strong></span>
            <span>Theme: <strong className="text-foreground capitalize">{theme ?? "system"}</strong></span>
            <span>Density: <strong className="text-foreground capitalize">{density}</strong></span>
          </div>
        </div>
      </div>

      {/* Theme Mode */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Sun className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Color Theme</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { id: "light", label: "Light", icon: Sun, desc: "Clean, high-contrast light mode." },
            { id: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes in low light." },
            { id: "system", label: "System", icon: Laptop, desc: "Follows your operating system." },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTheme(item.id)}
              className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                theme === item.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <item.icon className="size-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">{item.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Font Family */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Type className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Font Family</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: "inter", label: "Inter (Default)", description: "The standard system font." },
            { id: "roboto", label: "Roboto", description: "A geometric, mechanical font." },
            { id: "opensans", label: "Open Sans", description: "Friendly and highly readable." },
            { id: "lato", label: "Lato", description: "Warm and balanced proportions." },
          ].map((font) => (
            <label
              key={font.id}
              onClick={() => setSelectedFont(font.id)}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                selectedFont === font.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <input
                type="radio"
                name="themeFont"
                value={font.id}
                checked={selectedFont === font.id}
                onChange={() => setSelectedFont(font.id)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                <span className="block font-medium text-foreground text-sm">{font.label}</span>
                <span className="block text-xs text-muted-foreground">{font.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Text Scaling */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ZoomIn className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Text Scaling</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { id: "small", label: "Small (92%)", desc: "More data on screen." },
            { id: "normal", label: "Normal (Default)", desc: "Standard text size." },
            { id: "large", label: "Large (110%)", desc: "Easier reading." },
          ].map((size) => (
            <label
              key={size.id}
              onClick={() => setSelectedSize(size.id)}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                selectedSize === size.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <input
                type="radio"
                name="themeSize"
                value={size.id}
                checked={selectedSize === size.id}
                onChange={() => setSelectedSize(size.id)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <div>
                <span className="block font-medium text-foreground text-sm">{size.label}</span>
                <span className="block text-xs text-muted-foreground">{size.desc}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Table & Interface Density */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <TableProperties className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Table & Grid Density</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { id: "compact" as TableDensity, label: "Compact", desc: "Tight row heights for maximum information per screen." },
            { id: "default" as TableDensity, label: "Default", desc: "Balanced row padding and readable row heights." },
            { id: "comfortable" as TableDensity, label: "Comfortable", desc: "Spacious layout with generous touch padding." },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDensity(item.id)}
              className={`flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors ${
                density === item.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <span className="font-semibold text-sm text-foreground">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Appearance Settings"}
        </Button>
      </div>
    </form>
  );
}
