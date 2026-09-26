const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://smart-reach-staging.vercel.app';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function run() {
  console.log("1. Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1500,1050'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1050 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('error') || text.includes('Error')) {
      console.log('BROWSER LOG:', text);
    }
  });
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  const testUser = {
    name: 'Select All Tester',
    email: `selectall.${Date.now()}@smartreach-demo.com`,
    password: 'Password123!Secure',
  };

  console.log(`2. Navigating to ${BASE_URL}/signup...`);
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#name', { timeout: 10000 });
  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);
  await page.click('form button');

  console.log("Waiting for signup redirect...");
  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 20000 });

  // 3. Navigate to /leads
  console.log("3. Navigating to /leads...");
  await page.goto(`${BASE_URL}/leads`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Wait for table to render
  await page.waitForSelector('table', { timeout: 10000 });

  console.log("4. Capturing initial state...");
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '50_select_all_initial.png') });

  // Helper to click an element with native mouse events
  const mouseClickElement = async (finderFn) => {
    const coords = await page.evaluate(finderFn);
    if (!coords) throw new Error("Element not found for mouse click");
    await page.mouse.click(coords.x, coords.y);
  };

  // 5. Open the Select dropdown in action controls
  console.log("5. Opening Select dropdown...");
  await mouseClickElement(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent && b.textContent.trim().startsWith('Select'));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '51_select_dropdown_open.png') });

  // 6. Click "Select this page"
  console.log("6. Selecting current page...");
  await mouseClickElement(() => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const item = items.find(el => el.textContent && el.textContent.includes('Select this page'));
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '52_select_page_banner.png') });

  // 7. Click "Select all ... leads in this list"
  console.log("7. Selecting all leads in list via banner...");
  await mouseClickElement(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(el => el.textContent && el.textContent.includes('Select all') && el.textContent.includes('leads in this list'));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '53_select_all_matching_banner.png') });

  // 8. Click "Add All ... to List"
  console.log("8. Clicking Add All to List...");
  await mouseClickElement(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent && b.textContent.includes('Add All') && b.textContent.includes('to List'));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '54_add_all_matching_modal.png') });

  // 9. Close modal
  console.log("9. Closing modal and testing header dropdown...");
  await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Cancel');
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 10. Click the small chevron next to the table header checkbox
  await mouseClickElement(() => {
    const btn = document.querySelector('th button[aria-label="Selection options"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '55_header_checkbox_dropdown.png') });

  console.log("All screenshots captured successfully!");
  await browser.close();
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
