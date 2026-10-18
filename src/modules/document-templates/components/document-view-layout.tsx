"use client";

import { useState } from "react";
import { Printer, Download, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentPaperSheet } from "./document-paper-sheet";
import type { DocumentTemplateData, DocumentTemplateVariant } from "../types";
import type { TemplateSettings } from "../template-settings";

export interface DocumentViewLayoutProps {
  data: DocumentTemplateData;
  settings: TemplateSettings;
  variant: DocumentTemplateVariant;
  pdfUrl: string;
  documentNumber: string;
  children?: React.ReactNode;
  defaultView?: "document" | "operations";
}

export function DocumentViewLayout({
  data,
  settings,
  variant,
  pdfUrl,
  documentNumber,
  children,
  defaultView = "document",
}: DocumentViewLayoutProps) {
  const [activeTab, setActiveTab] = useState<"document" | "operations">(defaultView);
  const [zoom, setZoom] = useState<"fit" | "75" | "100">("100");

  const handlePrint = () => {
    // If not on document tab, temporarily ensure printable sheet is visible or simply call window.print()
    window.print();
  };

  return (
    <div className="w-full space-y-4">
      {/* View Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print border-b border-border pb-3">
        <div role="tablist" aria-label="Document view modes" className="flex items-center gap-1.5 p-1 rounded-lg bg-surface-muted border border-border">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "document"}
            onClick={() => setActiveTab("document")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "document"
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="size-3.5" />
            <span>Document View (Paper)</span>
          </button>
          {children && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "operations"}
              onClick={() => setActiveTab("operations")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "operations"
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="size-3.5" />
              <span>Operational & Ledger</span>
            </button>
          )}
        </div>

        {activeTab === "document" && (
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground bg-surface-muted px-2 py-1 rounded-md border border-border" role="toolbar" aria-label="Zoom controls">
              <span className="text-[11px] font-medium mr-1">Zoom:</span>
              <button
                type="button"
                title="Scale to 75%"
                aria-pressed={zoom === "75"}
                onClick={() => setZoom("75")}
                className={`px-1.5 py-0.5 rounded transition-colors ${zoom === "75" ? "bg-surface-raised font-bold text-foreground shadow-xs" : "hover:text-foreground"}`}
              >
                75%
              </button>
              <button
                type="button"
                title="Fit to container width"
                aria-pressed={zoom === "fit"}
                onClick={() => setZoom("fit")}
                className={`px-1.5 py-0.5 rounded transition-colors ${zoom === "fit" ? "bg-surface-raised font-bold text-foreground shadow-xs" : "hover:text-foreground"}`}
              >
                Fit
              </button>
              <button
                type="button"
                title="100% standard size"
                aria-pressed={zoom === "100"}
                onClick={() => setZoom("100")}
                className={`px-1.5 py-0.5 rounded transition-colors ${zoom === "100" ? "bg-surface-raised font-bold text-foreground shadow-xs" : "hover:text-foreground"}`}
              >
                100%
              </button>
            </div>

            {/* Quick Print Button */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs font-semibold"
            >
              <Printer className="size-3.5 text-primary" />
              <span>Print</span>
            </Button>

            {/* Download PDF Button */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              asChild
              className="gap-1.5 text-xs font-semibold"
            >
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <Download className="size-3.5 text-primary" />
                <span>Download PDF</span>
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === "document" ? (
        <div className="space-y-4">
          {/* Manager.io Realistic Desk Canvas */}
          <div className="print-document-container w-full rounded-2xl bg-slate-100/90 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 p-3 sm:p-8 flex justify-center overflow-x-auto min-h-[600px] transition-all">
            <div
              className={`transition-transform duration-200 origin-top flex justify-center w-full ${
                zoom === "75"
                  ? "scale-75 max-w-[820px]"
                  : zoom === "fit"
                  ? "w-full max-w-full"
                  : "w-full max-w-[820px]"
              }`}
            >
              <DocumentPaperSheet data={data} settings={settings} variant={variant} />
            </div>
          </div>

          {/* Quick Info & Operational Link Banner */}
          {children && (
            <div className="no-print flex items-center justify-between rounded-lg border border-border bg-surface-raised p-4 text-xs text-muted-foreground shadow-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Operational status:</span>
                <span>Document {documentNumber} is active in ledger.</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("operations")}
                className="font-medium text-primary hover:underline flex items-center gap-1"
              >
                <span>View Relational Flow & Accounting Details</span>
                <span>→</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Operational Details View */
        <div className="space-y-6">{children}</div>
      )}
    </div>
  );
}
