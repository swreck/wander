// Generate PNG icons from SVG using Playwright
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icons/wander-icon.svg');
const svgContent = readFileSync(svgPath, 'utf-8');

const sizes = [
  { name: 'icon-32.png', size: 32 },
  { name: 'icon-180.png', size: 180 },   // apple-touch-icon
  { name: 'icon-192.png', size: 192 },   // manifest
  { name: 'icon-512.png', size: 512 },   // manifest
];

const browser = await chromium.launch();

for (const { name, size } of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const dataUrl = `data:text/html,<html><body style="margin:0;padding:0;overflow:hidden"><img src="data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`;
  await page.goto(dataUrl);
  await page.waitForTimeout(500);
  const outPath = resolve(__dirname, '../public/icons/', name);
  await page.screenshot({ path: outPath, omitBackground: true });
  console.log(`Generated ${name} (${size}x${size})`);
  await page.close();
}

await browser.close();
console.log('Done!');
