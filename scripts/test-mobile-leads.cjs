const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://smart-reach-staging.vercel.app';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=390,844', '--force-device-scale-factor=1'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const testUser = {
    name: 'Mobile Tester',
    email: `mobile.leads.${Date.now()}@smartreach-demo.com`,
    password: 'Password123!Secure',
  };

  console.log("Navigating to signup on mobile...");
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#name', { timeout: 10000 });
  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);
  await page.click('form button');

  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 20000 });
  console.log("Navigating to /leads...");
  await page.goto(`${BASE_URL}/leads`, { waitUntil: 'networkidle2' });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await new Promise(r => setTimeout(r, 3000));

  // Check scroll widths and overflowing elements
  const metrics = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const bodyWidth = document.body.scrollWidth;

    // Find all elements wider than window.innerWidth
    const overflowing = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollWidth > winWidth + 5) {
        overflowing.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          scrollWidth: el.scrollWidth,
        });
      }
    });

    // Check table scrollability
    const tableEl = document.querySelector('table');
    const tableContainer = tableEl ? tableEl.parentElement : null;
    const tableMetrics = tableContainer ? {
      scrollWidth: tableContainer.scrollWidth,
      clientWidth: tableContainer.clientWidth,
      isTableHorizontallyScrollable: tableContainer.scrollWidth > tableContainer.clientWidth,
    } : null;

    const activeTabText = document.querySelector('[data-state="active"]')?.textContent || '';
    const leadsRootClasses = document.querySelector('.apollo-leads-root')?.className || '';

    return {
      activeTabText,
      leadsRootClasses,
      docWidth,
      winWidth,
      bodyWidth,
      isPageHorizontallyScrollable: docWidth > winWidth,
      overflowCount: overflowing.length,
      tableMetrics,
    };
  });

  console.log("Mobile Metrics:", JSON.stringify(metrics, null, 2));

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '43_mobile_leads_fixed.png'), fullPage: false });
  console.log("Saved 43_mobile_leads_fixed.png");

  // Scroll down to the table card with clearance for fixed top nav (56px)
  await page.evaluate(() => {
    const tableEl = document.querySelector('table');
    if (tableEl) {
      const card = tableEl.closest('.rounded-xl') || tableEl;
      const rect = card.getBoundingClientRect();
      window.scrollBy({ top: rect.top - 65, behavior: 'instant' });
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '44_mobile_leads_table_card.png'), fullPage: false });
  console.log("Saved 44_mobile_leads_table_card.png");

  // Test scrolling the table internally horizontally by 300px
  await page.evaluate(() => {
    const tableEl = document.querySelector('table');
    const tableContainer = tableEl ? tableEl.parentElement : null;
    if (tableContainer) {
      tableContainer.scrollLeft = 300;
    }
  });
  // Scroll to the bottom of the table card to see pagination footer
  await page.evaluate(() => {
    const tableEl = document.querySelector('table');
    if (tableEl) {
      const card = tableEl.closest('.rounded-xl') || tableEl;
      card.scrollIntoView({ behavior: 'instant', block: 'end' });
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '49_mobile_leads_pagination_footer.png'), fullPage: false });
  console.log("Saved 49_mobile_leads_pagination_footer.png");

  await browser.close();
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
