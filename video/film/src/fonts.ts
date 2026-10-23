import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/** The site's families: Libre Franklin 900 italic (display), Geist (body), Geist Mono (detail), Amiri (Arabic). */
export const fontsReady = Promise.all([
  loadFont({ family: "Libre Franklin", url: staticFile("fonts/libre-franklin-latin-900-italic.woff2"), weight: "900", style: "italic" }),
  loadFont({ family: "Libre Franklin", url: staticFile("fonts/libre-franklin-latin-700-normal.woff2"), weight: "700", style: "normal" }),
  loadFont({ family: "Geist", url: staticFile("fonts/geist-latin-300-normal.woff2"), weight: "300" }),
  loadFont({ family: "Geist", url: staticFile("fonts/geist-latin-400-normal.woff2"), weight: "400" }),
  loadFont({ family: "Geist", url: staticFile("fonts/geist-latin-500-normal.woff2"), weight: "500" }),
  loadFont({ family: "Geist Mono", url: staticFile("fonts/geist-mono-latin-400-normal.woff2"), weight: "400" }),
  loadFont({ family: "Amiri", url: staticFile("fonts/amiri-arabic-700-normal.woff2"), weight: "700" }),
]);

export const DISPLAY = { fontFamily: "Libre Franklin", fontWeight: 900, fontStyle: "italic" as const, textTransform: "uppercase" as const, letterSpacing: "-0.01em", lineHeight: 0.9 };
export const BODY = { fontFamily: "Geist", fontWeight: 300 };
export const MONO = { fontFamily: "Geist Mono", fontWeight: 400, textTransform: "uppercase" as const, letterSpacing: "0.28em" };
