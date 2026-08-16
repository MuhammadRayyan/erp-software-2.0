import path from "node:path";
import { Font } from "@react-pdf/renderer";

const fontsDir = path.resolve(process.cwd(), "public", "fonts", "pdf");

async function run() {
  try {
    Font.register({
      family: "Roboto",
      fonts: [{ src: path.join(fontsDir, "roboto-400.ttf") }],
    });
    Font.register({
      family: "Open Sans",
      fonts: [{ src: path.join(fontsDir, "opensans-400.ttf") }],
    });
    Font.register({
      family: "Lato",
      fonts: [{ src: path.join(fontsDir, "lato-400.ttf") }],
    });
    console.log("Fonts registered successfully from local filesystem.");
  } catch (err) {
    console.error(err);
  }
}
run();

