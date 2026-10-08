import { chromium } from 'playwright'; import path from 'path'; import fs from 'fs'; import { pathToFileURL } from 'url';
import { ROOT } from './lib.mjs';

/** jobs: [{type:'event'|'remote'|'roundup'|'trending'|'closer', file, data}] -> 1080x1920 JPEGs (Instagram Stories accept JPEG only). */
export async function renderAll(slides) {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const s of slides) {
      fs.mkdirSync(path.dirname(s.file), { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
      await page.addInitScript(d => { window.__DATA__ = d; }, s.data);
      await page.goto(pathToFileURL(path.join(ROOT, 'templates', 'stories.html')).href + '?solo=' + s.type);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: s.file, type: 'jpeg', quality: 92 });
      await page.close();
    }
  } finally { await browser.close(); }
}
