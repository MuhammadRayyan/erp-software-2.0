// Note: puppeteer and handlebars are retained because the "custom-html" 
// template type is still actively reachable and used from the UI.
import puppeteer from "puppeteer";
import Handlebars from "handlebars";

export async function renderHtmlTemplate(
  htmlTemplate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any
): Promise<Buffer> {
  const template = Handlebars.compile(htmlTemplate);
  const html = template({ ...data, settings });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  
  try {
    const page = await browser.newPage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.setContent(html, { waitUntil: "networkidle0" as any });
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
