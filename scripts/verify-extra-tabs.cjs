const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'https://130-61-146-177.sslip.io';
const ARTIFACTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await page.type('input[type="email"], input[name="email"]', 'demo@ratecompany.com');
  await page.type('input[type="password"], input[name="password"]', 'demo123');
  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) await submitBtn.click();
  await sleep(2500);

  // 1. Dashboard scrolled down to activity feed
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => window.scrollTo(0, 600));
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'demo_08_dashboard_feed.png') });

  // 2. Saved Lists tab in /leads
  await page.goto(`${BASE_URL}/leads?tab=saved-lists`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'demo_09_saved_lists.png') });

  // 3. Blocklist / Suppressions
  await page.goto(`${BASE_URL}/blocklist`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'demo_10_blocklist.png') });

  await browser.close();
  console.log('Extra screenshots saved!');
}

run().catch(console.error);
