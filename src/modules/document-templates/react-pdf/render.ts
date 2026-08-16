import path from "node:path";
import { renderToBuffer, Font } from "@react-pdf/renderer";
import type { ReactElement } from "react";

let fontsRegistered = false;

/**
 * Registers fonts from the local filesystem (public/fonts/pdf/).
 * Using local TTF files avoids any network dependency during PDF generation,
 * ensuring offline/self-hosted operation and compliance with the project CSP
 * (connect-src 'self' — no external CDN allowed).
 */
function registerFonts() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "public", "fonts", "pdf");

  Font.register({
    family: "Inter",
    fonts: [{ src: path.join(fontsDir, "inter-400.ttf") }],
  });

  Font.register({
    family: "Roboto",
    fonts: [
      { src: path.join(fontsDir, "roboto-400.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "roboto-700.ttf"), fontWeight: 700 },
    ],
  });

  Font.register({
    family: "Open Sans",
    fonts: [
      { src: path.join(fontsDir, "opensans-400.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "opensans-700.ttf"), fontWeight: 700 },
    ],
  });

  Font.register({
    family: "Lato",
    fonts: [
      { src: path.join(fontsDir, "lato-400.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "lato-700.ttf"), fontWeight: 700 },
    ],
  });

  fontsRegistered = true;
}

export async function renderReactPdf(element: ReactElement): Promise<Buffer> {
  registerFonts();
  // @ts-expect-error renderToBuffer expects DocumentProps
  const pdfStream = await renderToBuffer(element);
  return Buffer.from(pdfStream);
}
