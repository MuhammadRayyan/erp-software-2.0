"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { upsertUserSettings } from "./actions";

export function AppearanceForm({ initialFont, initialSize }: { initialFont: string; initialSize: string }) {
  const [isPending, startTransition] = useTransition();

  const handleSave = (formData: FormData) => {
    const font = formData.get("themeFont") as string;
    const size = formData.get("themeSize") as string;
    
    startTransition(async () => {
      try {
        await upsertUserSettings(font, size);
        toast.success("Appearance settings updated successfully.");
      } catch {
        toast.error("Failed to update appearance settings.");
      }
    });
  };

  return (
    <form action={handleSave} className="space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-medium mb-3">Font Family</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { id: "inter", label: "Inter (Default)", description: "The standard system font." },
              { id: "roboto", label: "Roboto", description: "A geometric, mechanical font." },
              { id: "opensans", label: "Open Sans", description: "Friendly and highly readable." },
              { id: "lato", label: "Lato", description: "Warm and balanced proportions." }
            ].map(font => (
              <label key={font.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-4 cursor-pointer hover:bg-surface-muted transition-colors">
                <input 
                  type="radio" 
                  name="themeFont" 
                  value={font.id} 
                  defaultChecked={initialFont === font.id}
                  className="size-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="block font-medium">{font.label}</span>
                  <span className="block text-sm text-muted-foreground">{font.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-3">Text Scaling</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { id: "small", label: "Small" },
              { id: "normal", label: "Normal (Default)" },
              { id: "large", label: "Large" }
            ].map(size => (
              <label key={size.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-4 cursor-pointer hover:bg-surface-muted transition-colors">
                <input 
                  type="radio" 
                  name="themeSize" 
                  value={size.id} 
                  defaultChecked={initialSize === size.id}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="block font-medium">{size.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Appearance Settings"}
        </Button>
      </div>
    </form>
  );
}
