/**
 * Capture screenshots of the tofu-k8s-console UI.
 *
 * Prerequisites:
 *   npm install -g playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   1. Start the console: ./bin/tofu-k8s-console
 *   2. Run: node scripts/screenshots.mjs [base-url] [project-path]
 *
 * Defaults:
 *   base-url:     http://localhost:8090
 *   project-path: /projects/garage/garage-s3-buckets
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8090';
const PROJECT = process.argv[3] || '/projects/garage/garage-s3-buckets';
const DIR = 'docs/screenshots';

const pages = [
  { path: '/', name: 'overview' },
  { path: '/projects', name: 'projects' },
  { path: PROJECT, name: 'project-detail' },
  { path: '/programs', name: 'programs' },
  { path: '/resources', name: 'resources', action: async (page) => {
    const btn = page.locator('button', { hasText: 'Load Resources' });
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  }},
  { path: '/jobs', name: 'jobs' },
  { path: '/graph', name: 'stack-graph' },
  { path: '/projects/new', name: 'create-project' },
  { path: '/programs/new', name: 'create-program' },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    colorScheme: 'dark',
  });

  for (const p of pages) {
    console.log(`Capturing ${p.name}...`);
    const page = await context.newPage();
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    if (p.action) await p.action(page);
    await page.screenshot({ path: `${DIR}/${p.name}.png`, fullPage: false });
    await page.close();
  }

  // Project detail tabs
  for (const tab of ['resources', 'revisions', 'spec']) {
    console.log(`Capturing project-${tab}...`);
    const page = await context.newPage();
    await page.goto(`${BASE}${PROJECT}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const text = await buttons.nth(i).textContent();
      if (text && text.toLowerCase().startsWith(tab)) {
        await buttons.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/project-${tab}.png`, fullPage: false });
    await page.close();
  }

  // Job with expanded logs
  console.log('Capturing job-logs...');
  const logsPage = await context.newPage();
  await logsPage.goto(`${BASE}/jobs`, { waitUntil: 'load' });
  await logsPage.waitForTimeout(1500);
  await logsPage.locator('tr').nth(1).click();
  await logsPage.waitForTimeout(1500);
  await logsPage.screenshot({ path: `${DIR}/job-logs.png`, fullPage: false });
  await logsPage.close();

  await browser.close();
  console.log(`Done! ${pages.length + 4} screenshots saved to ${DIR}/`);
})();
