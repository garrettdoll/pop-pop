// Regenerates the PNG icons from the same type and colors the app uses.
// Run from the repo root:  NODE_PATH=$(npm root -g) node tools/make-icons.mjs
// (needs Playwright with Chromium; nothing here is needed to run the app itself)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Embedded as a data URI: Chromium won't load a file:// font into an about:blank page.
const font = `data:font/woff2;base64,${fs.readFileSync(path.join(root, 'app/fonts/archivo-latin.woff2')).toString('base64')}`;

// Keep in step with app/tokens.css
const ACCENT = '#ffe600';
const INK = '#0a0a0a';

/** scale < 1 pulls the artwork into the middle (for maskable icons, whose edges get cropped). */
const page = ({ size, scale = 1, round }) => `<!doctype html><html><head><style>
@font-face { font-family: A; src: url("${font}"); font-weight: 100 900; font-stretch: 62% 125%; }
html, body { margin: 0; background: transparent; }
.icon { width: ${size}px; height: ${size}px; background: ${ACCENT}; position: relative; overflow: hidden; border-radius: ${round ? size * 0.2 : 0}px; }
.art { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; transform: scale(${scale}); }
.word { font-family: A, Impact, sans-serif; font-weight: 900; font-stretch: 62%; text-transform: uppercase; line-height: 0.86; font-size: ${size * 0.5}px; color: ${INK}; letter-spacing: 0.005em; white-space: nowrap; }
.word.two { margin-top: ${size * 0.035}px; background: ${INK}; color: ${ACCENT}; padding: ${size * 0.02}px ${size * 0.05}px ${size * 0.005}px; border-radius: ${size * 0.035}px; transform: rotate(-4deg); box-shadow: ${size * 0.025}px ${size * 0.025}px 0 rgba(10,10,10,0.28); }
</style></head><body><div class="icon"><div class="art"><div class="word">Pop!</div><div class="word two">Pop!</div></div></div></body></html>`;

const outputs = [
  { file: 'icons/icon-512.png', size: 512, round: true, scale: 0.9 },
  { file: 'icons/icon-192.png', size: 192, round: true, scale: 0.9 },
  { file: 'icons/apple-touch-icon.png', size: 180, scale: 0.92 }, // iOS rounds the corners itself, so no transparency here
  { file: 'icons/icon-maskable-512.png', size: 512, scale: 0.74 },
  { file: 'icons/favicon-32.png', size: 32, scale: 1.1 },
];

const browser = await chromium.launch();
for (const { file, size, scale, round } of outputs) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(page({ size, scale, round }));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(root, file), omitBackground: true });
  await p.close();
  console.log('wrote', file);
}
await browser.close();

// Vector favicon: shapes plus a text fallback (browsers draw it with whatever heavy face they have).
fs.writeFileSync(path.join(root, 'icons/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="13" fill="${ACCENT}"/>
  <text x="32" y="30" text-anchor="middle" font-family="Impact, 'Arial Narrow', Arial, sans-serif" font-weight="900" font-size="26" fill="${INK}">POP!</text>
  <rect x="7" y="35" width="50" height="21" rx="4" fill="${INK}" transform="rotate(-4 32 45)"/>
  <text x="32" y="52" text-anchor="middle" font-family="Impact, 'Arial Narrow', Arial, sans-serif" font-weight="900" font-size="20" fill="${ACCENT}" transform="rotate(-4 32 45)">POP!</text>
</svg>
`);
console.log('wrote icons/favicon.svg');
