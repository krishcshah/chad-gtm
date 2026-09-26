const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://smart-reach-staging.vercel.app';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1550,1100'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1550, height: 1100 });

  const testUser = {
    name: 'Showcase Explorer',
    email: `showcase.apollo.${Date.now()}@smartreach-demo.com`,
    password: 'Password123!Secure',
  };

  console.log("Navigating to signup...");
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#name', { timeout: 10000 });
  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);
  await page.click('form button');

  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 20000 });
  console.log("Navigating to /leads...");
  await page.goto(`${BASE_URL}/leads`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Leads Table Full with Expanded Sidebar
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '38_apollo_leads_table_full.png') });
  console.log("Saved 38_apollo_leads_table_full.png");

  // 2. Open CSV Upload Modal
  const uploadBtns = await page.$$('button');
  for (const b of uploadBtns) {
    const text = await page.evaluate(el => el.textContent || '', b);
    if (text.includes('Upload CSV') || text.includes('Upload New CSV')) {
      await b.click();
      await new Promise(r => setTimeout(r, 800));
      break;
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '41_apollo_csv_upload_modal.png') });
  console.log("Saved 41_apollo_csv_upload_modal.png");

  // Close upload dialog via Escape
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 600));

  // 3. Test Pagination: click Next
  console.log("Clicking Next page button...");
  const navBtns = await page.$$('button');
  for (const b of navBtns) {
    const text = await page.evaluate(el => el.textContent || '', b);
    if (text.trim() === 'Next') {
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '40_apollo_leads_pagination_page2.png') });
  console.log("Saved 40_apollo_leads_pagination_page2.png");

  await browser.close();
  console.log("Showcase capture completed!");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
