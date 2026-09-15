// Renders benchmark/pdf/report.html to benchmark/Aide-benchmark-report.pdf.
//   node benchmark/pdf/build-pdf.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file:///" + path.join(dir, "report.html").replace(/\\/g, "/"), { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
const out = path.join(dir, "..", "Aide-benchmark-report.pdf");
await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "11mm", bottom: "11mm", left: "12mm", right: "12mm" } });
await browser.close();
console.log("wrote", out);
