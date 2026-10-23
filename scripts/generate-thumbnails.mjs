#!/usr/bin/env node
/**
 * Renders a studio thumbnail of every ring with the real viewer (same diamond shader,
 * lighting and metals) by screenshotting /capture/<category>/<model>.
 *
 *   npm run dev                                  # or npm start
 *   npm run thumbnails -- --base http://localhost:3010 [--force] [--only Solitaire]
 *
 * Output: public/thumbnails/<category>/<model>-<angle>.webp
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = option('base', 'http://localhost:3000');
const ONLY = option('only', null);
const FORCE = args.includes('--force');
const SIZE = 1000;
const ANGLES = ['hero', 'top'];

const modelsDir = join(process.cwd(), 'public', '3d');
const outDir = join(process.cwd(), 'public', 'thumbnails');

const jobs = [];
for (const category of readdirSync(modelsDir)) {
  if (!statSync(join(modelsDir, category)).isDirectory() || (ONLY && category !== ONLY)) continue;
  for (const file of readdirSync(join(modelsDir, category))) {
    if (!/\.(glb|obj)$/i.test(file)) continue;
    const slug = file.replace(/\.(glb|obj)$/i, '');
    for (const angle of ANGLES) {
      const output = join(outDir, category, `${slug}-${angle}.webp`);
      if (FORCE || !existsSync(output)) jobs.push({ category, slug, angle, output });
    }
  }
}

if (jobs.length === 0) {
  console.log('All thumbnails exist. Use --force to re-render.');
  process.exit(0);
}

const browser = await puppeteer.launch({
  headless: 'new',
  // Use the real GPU where available; SwiftShader is far slower but still works
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default', '--enable-webgl'],
});
const page = await browser.newPage();
await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
page.on('pageerror', (err) => console.warn('  page error:', err.message));

let failed = 0;
for (const [i, job] of jobs.entries()) {
  const url = `${BASE}/capture/${encodeURIComponent(job.category)}/${encodeURIComponent(job.slug)}?angle=${job.angle}`;
  process.stdout.write(`[${i + 1}/${jobs.length}] ${job.category}/${job.slug} (${job.angle}) … `);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__ringReady === true', { timeout: 180000, polling: 250 });
    mkdirSync(join(outDir, job.category), { recursive: true });
    await page.screenshot({ path: job.output, type: 'webp', quality: 88 });
    console.log('done');
  } catch (error) {
    failed++;
    console.log(`failed: ${error.message}`);
  }
}

await browser.close();
console.log(failed ? `${failed} thumbnail(s) failed.` : 'All thumbnails rendered.');
process.exit(failed ? 1 : 0);
