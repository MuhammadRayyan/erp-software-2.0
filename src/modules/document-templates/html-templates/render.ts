import Handlebars from "handlebars";
import { withHtmlPdfPage } from "./browser-pool";

const HTML_RENDER_TIMEOUT_MS = 15_000;

/**
 * Renders a custom Handlebars HTML template to PDF through a pooled headless
 * Chrome instance, isolating each render in a fresh incognito browser context
 * with network requests and client scripts blocked.
 */
export async function renderHtmlTemplate(
  htmlTemplate: string,
  data: unknown,
  settings: unknown,
): Promise<Buffer> {
  const template = Handlebars.compile(htmlTemplate);
  const html = template({ ...(typeof data === "object" && data !== null ? data : {}), settings });

  return withHtmlPdfPage(async (page) => {
    // Disable client-side JavaScript inside headless Chromium to block XSS and malicious scripts entirely.
    await page.setJavaScriptEnabled(false);
    // The template renders fully offline: block any external network request
    // (images, fonts, scripts) so template HTML cannot exfiltrate data or
    // make the server call arbitrary URLs.
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      const isLocal =
        url.startsWith("data:") ||
        url.startsWith("about:") ||
        url.startsWith("blob:");
      if (isLocal) {
        void request.continue();
      } else {
        void request.abort();
      }
    });
    await page.setContent(html, { waitUntil: "load", timeout: HTML_RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      timeout: HTML_RENDER_TIMEOUT_MS,
      margin: { top: "40px", right: "40px", bottom: "40px", left: "40px" },
    });
    return Buffer.from(pdf);
  });
}
