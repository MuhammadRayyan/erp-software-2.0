"use client";

import { useEffect, useRef, useState } from "react";
import type { Designer } from "@pdfme/ui";
import { Download, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sampleInvoiceInput } from "./default-invoice-template";
import { type DocumentTemplate, renderInvoicePdf } from "./pdf-engine";
import { saveInvoiceTemplateAction } from "./actions";

export function TemplateDesigner({ businessId, initialTemplate }: { businessId: string; initialTemplate: DocumentTemplate }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState<"short" | "long" | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([import("@pdfme/ui"), import("@pdfme/schemas")]).then(([ui, schemas]) => {
      if (!active || !containerRef.current) return;
      const designer = new ui.Designer({
        domContainer: containerRef.current,
        template: initialTemplate,
        plugins: { Text: schemas.text, Table: schemas.table },
        options: { zoomLevel: 0.9, sidebarOpen: true, theme: { token: { colorPrimary: "#356fd0", borderRadius: 6 } } },
      });
      designer.onChangeTemplate(() => setDirty(true));
      designerRef.current = designer;
      setLoading(false);
    }).catch(() => { setLoading(false); toast.error("The pdfme designer could not be loaded."); });
    return () => { active = false; designerRef.current?.destroy(); designerRef.current = null; };
  }, [initialTemplate]);

  async function save() {
    if (!designerRef.current) return;
    setSaving(true);
    const result = await saveInvoiceTemplateAction(businessId, designerRef.current.getTemplate());
    setSaving(false);
    if (result.error) toast.error(result.error); else { setDirty(false); toast.success("Invoice template saved."); }
  }

  async function preview(long: boolean) {
    if (!designerRef.current) return;
    const popup = window.open("", "_blank");
    setPreviewing(long ? "long" : "short");
    try {
      const pdf = await renderInvoicePdf(designerRef.current.getTemplate(), sampleInvoiceInput(long));
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      if (popup) popup.location.href = url; else window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(long ? "Long invoice preview generated." : "Sample preview generated.");
    } catch (error) {
      popup?.close();
      toast.error(error instanceof Error ? error.message : "Preview generation failed");
    } finally { setPreviewing(null); }
  }

  return <div><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Drag text or the item table on the canvas, then save and reopen to verify persistence. {dirty && <span className="font-medium text-warning">Unsaved changes</span>}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => preview(false)} disabled={!!previewing || loading}>{previewing === "short" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} Preview sample</Button><Button variant="secondary" onClick={() => preview(true)} disabled={!!previewing || loading}>{previewing === "long" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} Preview long invoice</Button><Button onClick={save} disabled={saving || loading}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Save template</Button></div></div><div className="relative h-[720px] min-h-[560px] overflow-hidden rounded-lg border border-border bg-[#e7ebf0] dark:bg-[#18202b]">{loading && <div className="absolute inset-0 z-10 grid place-items-center bg-surface"><div className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading pdfme designer…</div></div>}<div ref={containerRef} className="h-full w-full" /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Pagination note: pdfme applies dynamic table reflow in generated previews, not as a full multi-page reflow inside the authored designer canvas. The long-preview action is the acceptance check.</p></div>;
}
