"use client";

import { useState } from "react";
import { FileText, Layers } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentPaperSheet } from "./document-paper-sheet";
import type { DocumentTemplateData, DocumentTemplateVariant } from "../types";
import type { TemplateSettings } from "../template-settings";

export interface DocumentViewLayoutProps {
  data: DocumentTemplateData;
  settings: TemplateSettings;
  variant: DocumentTemplateVariant;
  pdfUrl?: string;
  documentNumber?: string;
  children?: React.ReactNode;
  defaultView?: "document" | "operations";
}

export function DocumentViewLayout({
  data,
  settings,
  variant,
  children,
  defaultView = "document",
}: DocumentViewLayoutProps) {
  const [activeTab, setActiveTab] = useState<"document" | "operations">(defaultView);
  const [zoom, setZoom] = useState<"fit" | "75" | "100">("100");

  return (
    <div className="w-full space-y-4">
      {/* View Switcher Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <Tabs
          value={activeTab}
          onValueChange={(next) => setActiveTab(next === "operations" ? "operations" : "document")}
        >
          <TabsList aria-label="Document view modes">
            <TabsTrigger value="document" className="gap-2">
              <FileText className="size-3.5" />
              <span>Document View (Paper)</span>
            </TabsTrigger>
            {children && (
              <TabsTrigger value="operations" className="gap-2">
                <Layers className="size-3.5" />
                <span>Operational & Ledger</span>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

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
        </div>
      ) : (
        /* Operational Details View */
        <div className="space-y-6">{children}</div>
      )}
    </div>
  );
}
