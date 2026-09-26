const puppeteer = require('puppeteer-core');
const path = require('path');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://smart-reach-staging.vercel.app';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const testUser = {
    name: 'Elena Rostova',
    email: `elena.test.${Date.now()}@outreachcorp.de`,
    password: 'Password123!Secure',
  };

  console.log(`Step 1: Navigating to ${BASE_URL}/signup...`);
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_signup_page.png') });
  console.log('Saved 01_signup_page.png');

  console.log(`Step 2: Submitting signup form for ${testUser.email}...`);
  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);

  console.log('Submitting form...');
  await page.click('form button');

  console.log('Waiting for URL change or navigation...');
  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 20000 }).catch(e => console.log('Wait notice:', e.message));

  console.log('Current URL after signup:', page.url());
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_dashboard_after_signup.png') });
  console.log('Saved 02_dashboard_after_signup.png');

  await browser.close();
}

run().catch(err => {
  console.error('Fatal error in simulation:', err);
  process.exit(1);
});
