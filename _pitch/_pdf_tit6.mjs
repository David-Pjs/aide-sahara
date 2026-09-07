import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('file://' + path.join(dir, 'AIDE-deck-tit6.html').replace(/\\/g, '/'));
await page.waitForTimeout(1200);
await page.emulateMedia({ media: 'print' });

await page.pdf({
  path: path.join(dir, 'AIDE-deck-tit6.pdf'),
  width: '1280px',
  height: '720px',
  printBackground: true,
  margin: { top: 0, bottom: 0, left: 0, right: 0 },
});

console.log('PDF exported -> AIDE-deck-tit6.pdf');
await browser.close();
