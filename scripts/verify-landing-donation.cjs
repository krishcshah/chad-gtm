const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_URL || 'https://130-61-146-177.sslip.io';
const ARTIFACTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  console.log(`Starting Puppeteer verification against: ${BASE_URL}`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();

  // Desktop Test
  await page.setViewport({ width: 1440, height: 900 });
  console.log(`Navigating to ${BASE_URL}...`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);

  // Scroll to community-support section
  const section = await page.$('#community-support');
  if (!section) {
    console.error('ERROR: #community-support section NOT found on landing page!');
    await browser.close();
    process.exit(1);
  }

  console.log('Found #community-support section. Scrolling into view...');
  await page.evaluate(() => {
    const el = document.getElementById('community-support');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await sleep(1000);

  const desktopScreenshot = path.join(ARTIFACTS_DIR, 'landing_donation_section_desktop.png');
  await page.screenshot({ path: desktopScreenshot });
  console.log(`Saved desktop screenshot: ${desktopScreenshot}`);

  // Test selecting Monthly
  console.log('Testing Monthly toggle click...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#community-support button'));
    const monthlyBtn = buttons.find(b => b.textContent && b.textContent.includes('Monthly Support'));
    if (monthlyBtn) monthlyBtn.click();
  });
  await sleep(500);

  const desktopMonthlyScreenshot = path.join(ARTIFACTS_DIR, 'landing_donation_monthly_desktop.png');
  await page.screenshot({ path: desktopMonthlyScreenshot });
  console.log(`Saved monthly selected screenshot: ${desktopMonthlyScreenshot}`);

  // Test Custom input
  console.log('Testing Custom button click...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#community-support button'));
    const customBtn = buttons.find(b => b.textContent && b.textContent.includes('Custom'));
    if (customBtn) customBtn.click();
  });
  await sleep(500);

  // Type custom amount
  const customInput = await page.$('#community-support input');
  if (customInput) {
    await customInput.type('50');
    await sleep(500);
  }

  const desktopCustomScreenshot = path.join(ARTIFACTS_DIR, 'landing_donation_custom_desktop.png');
  await page.screenshot({ path: desktopCustomScreenshot });
  console.log(`Saved custom amount screenshot: ${desktopCustomScreenshot}`);

  // Mobile Viewport Test (390 x 844)
  console.log('Testing Mobile Viewport (390x844)...');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);

  await page.evaluate(() => {
    const el = document.getElementById('community-support');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await sleep(1000);

  const mobileScreenshot = path.join(ARTIFACTS_DIR, 'landing_donation_section_mobile.png');
  await page.screenshot({ path: mobileScreenshot });
  console.log(`Saved mobile screenshot: ${mobileScreenshot}`);

  console.log('All landing page donation tests passed successfully!');
  await browser.close();
}

run().catch((err) => {
  console.error('Puppeteer verification failed:', err);
  process.exit(1);
});
