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

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('=== TEST 1: Normal User (demo@ratecompany.com) ===');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await page.type('input[type="email"], input[name="email"]', 'demo@ratecompany.com');
  await page.type('input[type="password"], input[name="password"]', 'demo123');
  const loginBtn1 = await page.$('button[type="submit"]');
  if (loginBtn1) await loginBtn1.click();
  await sleep(2500);

  // Check sidebar navigation for Normal User
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  const sidebarTextNormal = await page.evaluate(() => document.querySelector('aside')?.innerText || '');
  console.log('Normal user sidebar contains "Bug Report"?', sidebarTextNormal.includes('Bug Report'));
  console.log('Normal user sidebar contains "Admin"?', sidebarTextNormal.includes('Admin'));

  // Go to /bug-report
  console.log('Navigating to /bug-report...');
  await page.goto(`${BASE_URL}/bug-report`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_01_bug_report_page.png') });

  // Fill and submit bug report
  console.log('Submitting a bug report...');
  await page.type('input[name="heading"], #heading', 'Test report: Lead filter dropdown flickering on scroll');
  await page.type('textarea[name="description"], #description', 'When scrolling down the 300k lead list with the dropdown open, the options menu flickers and closes automatically.');
  const sendBtn = await page.$('button[type="submit"]');
  if (sendBtn) await sendBtn.click();
  await sleep(2500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_02_bug_report_submitted.png') });

  // Attempt to access /admin as normal user
  console.log('Attempting to access /admin as normal user...');
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_03_admin_restricted_for_normal_user.png') });

  // Sign out
  console.log('Signing out...');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(1000);
  const signoutBtn = await page.$('button[aria-label="Sign out"], button[title="Sign out"]');
  if (signoutBtn) await signoutBtn.click();
  await sleep(2000);

  // Clear cookies to be 100% clean
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');

  console.log('=== TEST 2: Admin User (de.krish.shah@gmail.com) ===');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await page.type('input[type="email"], input[name="email"]', 'de.krish.shah@gmail.com');
  await page.type('input[type="password"], input[name="password"]', 'demo123');
  const loginBtn2 = await page.$('button[type="submit"]');
  if (loginBtn2) await loginBtn2.click();
  await sleep(2500);

  // Check sidebar navigation for Admin User
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  const sidebarTextAdmin = await page.evaluate(() => document.querySelector('aside')?.innerText || '');
  console.log('Admin user sidebar contains "Admin"?', sidebarTextAdmin.includes('Admin'));
  console.log('Admin user sidebar contains "Bug Report"?', sidebarTextAdmin.includes('Bug Report'));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_04_admin_sidebar.png') });

  // Navigate to /admin
  console.log('Navigating to /admin...');
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_05_admin_console_all_reports.png') });

  // Filter by status = open
  console.log('Testing status filter...');
  const selectFilter = await page.$('select');
  if (selectFilter) {
    await page.select('select', 'open');
    await sleep(1000);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_06_admin_console_filter_open.png') });
  }

  console.log('All tests completed successfully!');
  await browser.close();
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
