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
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  console.log(`Launching Chrome and navigating to ${BASE_URL}/login...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Login
  console.log('Navigating to login page...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);

  console.log('Filling in demo credentials (demo@ratecompany.com / demo123)...');
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
  await page.type('input[type="email"], input[name="email"]', 'demo@ratecompany.com');
  await page.type('input[type="password"], input[name="password"]', 'demo123');

  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  console.log('Waiting for navigation to dashboard...');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2500);

  const currentUrl = page.url();
  console.log(`Current URL after login: ${currentUrl}`);

  // 2. Dashboard
  console.log('Capturing Dashboard...');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2000);
  const dashScreenshot = path.join(ARTIFACTS_DIR, 'demo_01_dashboard.png');
  await page.screenshot({ path: dashScreenshot, fullPage: false });
  console.log(`Saved: ${dashScreenshot}`);

  // 3. Campaigns
  console.log('Capturing Campaigns...');
  await page.goto(`${BASE_URL}/campaigns`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2000);
  const campScreenshot = path.join(ARTIFACTS_DIR, 'demo_02_campaigns.png');
  await page.screenshot({ path: campScreenshot, fullPage: false });
  console.log(`Saved: ${campScreenshot}`);

  // 4. Lead Lists
  console.log('Capturing Lead Lists...');
  await page.goto(`${BASE_URL}/leads`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2000);
  const listsScreenshot = path.join(ARTIFACTS_DIR, 'demo_03_lead_lists.png');
  await page.screenshot({ path: listsScreenshot, fullPage: false });
  console.log(`Saved: ${listsScreenshot}`);

  // 5. Individual Lead List Details
  console.log('Capturing Lead List Details (lst_demo_1)...');
  await page.goto(`${BASE_URL}/leads/lst_demo_1`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2000);
  const leadTableScreenshot = path.join(ARTIFACTS_DIR, 'demo_04_leads_table.png');
  await page.screenshot({ path: leadTableScreenshot, fullPage: false });
  console.log(`Saved: ${leadTableScreenshot}`);

  // 6. UniBox
  console.log('Capturing UniBox...');
  await page.goto(`${BASE_URL}/unibox`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2000);
  
  // Try to click the first thread in the thread list to load its conversation
  const threadItems = await page.$$('div[role="button"], tr, [data-thread-id], .cursor-pointer');
  for (const item of threadItems) {
    const text = await page.evaluate(el => el.innerText, item);
    if (text && (text.includes('Weber') || text.includes('Jenkins') || text.includes('Meeting') || text.includes('Demo'))) {
      await item.click().catch(() => {});
      await sleep(1000);
      break;
    }
  }
  await sleep(1000);
  const uniboxScreenshot = path.join(ARTIFACTS_DIR, 'demo_05_unibox.png');
  await page.screenshot({ path: uniboxScreenshot, fullPage: false });
  console.log(`Saved: ${uniboxScreenshot}`);

  // 7. Senders
  console.log('Capturing Senders...');
  await page.goto(`${BASE_URL}/senders`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2000);
  const sendersScreenshot = path.join(ARTIFACTS_DIR, 'demo_06_senders.png');
  await page.screenshot({ path: sendersScreenshot, fullPage: false });
  console.log(`Saved: ${sendersScreenshot}`);

  // 8. Templates
  console.log('Capturing Templates...');
  await page.goto(`${BASE_URL}/templates`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(2000);
  const templatesScreenshot = path.join(ARTIFACTS_DIR, 'demo_07_templates.png');
  await page.screenshot({ path: templatesScreenshot, fullPage: false });
  console.log(`Saved: ${templatesScreenshot}`);

  console.log('All verification screenshots captured successfully!');
  await browser.close();
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
