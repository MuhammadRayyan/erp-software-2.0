import Handlebars from "handlebars";

/**
 * Renders a custom Handlebars HTML template to PDF through headless Chrome.
 *
 * Puppeteer is imported lazily: the module only loads when a business actually
 * renders a custom-HTML template, so every other PDF route avoids the
 * heavyweight Chromium dependency entirely.
 */
export async function renderHtmlTemplate(
  htmlTemplate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any
): Promise<Buffer> {
  const template = Handlebars.compile(htmlTemplate);
  const html = template({ ...data, settings });

  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
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
        request.continue();
      } else {
        request.abort();
      }
    });
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "40px", right: "40px", bottom: "40px", left: "40px" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
