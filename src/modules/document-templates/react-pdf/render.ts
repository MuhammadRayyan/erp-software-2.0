import { renderToBuffer, Font } from "@react-pdf/renderer";
import type { ReactElement } from "react";

let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  
  Font.register({
    family: 'Inter',
    fonts: [{ src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf' }]
  });
  
  Font.register({
    family: 'Roboto',
    fonts: [{ src: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf' }]
  });

  Font.register({
    family: 'Open Sans',
    fonts: [{ src: 'https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-400-normal.ttf' }]
  });

  Font.register({
    family: 'Lato',
    fonts: [{ src: 'https://cdn.jsdelivr.net/fontsource/fonts/lato@latest/latin-400-normal.ttf' }]
  });

  fontsRegistered = true;
}

export async function renderReactPdf(element: ReactElement): Promise<Buffer> {
  registerFonts();
  // @ts-expect-error renderToBuffer expects DocumentProps
  const pdfStream = await renderToBuffer(element);
  return Buffer.from(pdfStream);
}
