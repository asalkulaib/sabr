// Renders the PNG icons from docs/icons/icon.svg with a headless browser.
// Run with: npm run icons
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'icons');
const svg = await readFile(path.join(dir, 'icon.svg'), 'utf8');
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const body = inner.replace(/<rect[^>]*\/>/, '');

// Maskable: same art at 80% so it stays inside the safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/><g transform="translate(51.2 51.2) scale(0.8)">${body}</g></svg>`;

const OUT = [
  { name: 'apple-touch-icon.png', size: 180, art: svg },
  { name: 'icon-192.png', size: 192, art: svg },
  { name: 'icon-512.png', size: 512, art: svg },
  { name: 'icon-maskable-512.png', size: 512, art: maskable },
  { name: 'icon-32.png', size: 32, art: svg },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const o of OUT) {
  const page = await browser.newPage({ viewport: { width: o.size, height: o.size }, deviceScaleFactor: 1 });
  const art = o.art.replace('<svg ', `<svg width="${o.size}" height="${o.size}" `);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#FFFFFF">${art}</body></html>`);
  await page.screenshot({ path: path.join(dir, o.name), omitBackground: false });
  await page.close();
  console.log(`rendered ${o.name}`);
}
await browser.close();
