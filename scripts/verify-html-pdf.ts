import { closeHtmlPdfBrowser } from "../src/modules/document-templates/html-templates/browser-pool";
import { renderHtmlTemplate } from "../src/modules/document-templates/html-templates/render";

async function main() {
  // Use the application's actual renderer, not a separate Puppeteer launch configuration.
  try {
    const pdf = await renderHtmlTemplate(
      "<!doctype html><html><body><h1>{{title}}</h1><p>Synthetic image verification.</p></body></html>",
      { title: "ARM64 PDF verification" },
      {},
    );
    if (pdf.length < 1000 || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("HTML PDF rendering failed.");
    console.log(`Production HTML renderer generated a valid ${pdf.length}-byte PDF.`);
  } finally {
    await closeHtmlPdfBrowser();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "PDF verification failed."); process.exitCode = 1; });
