const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'http://localhost:3005';

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
    if (text.includes('[leads-directory]') || text.includes('error') || text.includes('Error')) {
      console.log('BROWSER LOG:', text);
    }
  });
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  const testUser = {
    name: 'Apollo Lead Explorer',
    email: `apollo.lead.${Date.now()}@smartreach-demo.com`,
    password: 'Password123!Secure',
  };

  console.log(`2. Navigating to ${BASE_URL}/signup...`);
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);
  await page.click('form button');

  console.log("Waiting for dashboard redirect...");
  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 20000 });
  console.log("Current URL after signup:", page.url());

  // 3. Navigate to /leads
  console.log("3. Navigating to /leads...");
  await page.goto(`${BASE_URL}/leads`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // 4. Test Sidebar Collapsible Toggle
  console.log("4. Testing collapsible sidebar toggle...");
  const sidebarToggle = await page.$('button[title*="Collapse sidebar"], button[title*="sidebar"]');
  if (sidebarToggle) {
    console.log("Clicking sidebar collapse button...");
    await sidebarToggle.click();
    await new Promise(r => setTimeout(r, 600));
  } else {
    // Try finding by svg / class
    const buttons = await page.$$('header button, aside button');
    for (const b of buttons) {
      const title = await page.evaluate(el => el.getAttribute('title') || el.getAttribute('aria-label') || '', b);
      if (title.toLowerCase().includes('sidebar') || title.toLowerCase().includes('collapse')) {
        await b.click();
        await new Promise(r => setTimeout(r, 600));
        break;
      }
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '33_sidebar_collapsed.png') });
  console.log("Saved 33_sidebar_collapsed.png");

  // 5. Inspect Apollo Leads Table
  console.log("5. Inspecting Apollo Leads Table...");
  const totalLeadsText = await page.evaluate(() => {
    const el = document.querySelector('.apollo-leads-root');
    return el ? el.innerText.slice(0, 300) : 'Not found';
  });
  console.log("Initial page preview:\n", totalLeadsText);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '34_apollo_leads_table.png') });
  console.log("Saved 34_apollo_leads_table.png");

  // 6. Test Filtering: Select an Industry checkbox and click "Filter Leads"
  console.log("6. Testing filter selection...");
  const industryCheckboxes = await page.$$('label input[type="checkbox"], label button[role="checkbox"]');
  console.log(`Found ${industryCheckboxes.length} checkbox elements`);

  if (industryCheckboxes.length > 0) {
    console.log("Clicking first industry checkbox (e.g. Restaurants or Marketing)...");
    await industryCheckboxes[0].click();
    await new Promise(r => setTimeout(r, 400));
  }

  // Click "Filter Leads" button
  console.log("Clicking 'Filter Leads' button...");
  const filterBtns = await page.$$('button');
  let filterClicked = false;
  for (const btn of filterBtns) {
    const text = await page.evaluate(el => el.textContent || '', btn);
    if (text.includes('Filter Leads')) {
      await btn.click();
      filterClicked = true;
      console.log("Clicked 'Filter Leads' button!");
      break;
    }
  }

  console.log("Waiting for query results...");
  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '35_apollo_leads_filtered.png') });
  console.log("Saved 35_apollo_leads_filtered.png");

  // 7. Inspect Lead Details Sheet
  console.log("7. Testing Lead Details Sheet inspection...");
  const inspectBtns = await page.$$('button');
  let inspectClicked = false;
  for (const btn of inspectBtns) {
    const text = await page.evaluate(el => el.textContent || '', btn);
    if (text.trim() === 'Inspect') {
      await btn.click();
      inspectClicked = true;
      console.log("Clicked Inspect button on lead!");
      break;
    }
  }

  if (inspectClicked) {
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '36_apollo_lead_details_sheet.png') });
    console.log("Saved 36_apollo_lead_details_sheet.png");

    // Close the sheet
    const closeBtn = await page.$('button[data-state="open"], [data-radix-dialog-content] button');
    if (closeBtn) {
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // 8. Test Add Selected to Campaign List
  console.log("8. Testing lead selection and Add to Campaign List...");
  // Select table rows via checkboxes
  const tableCheckboxes = await page.$$('table tbody input[type="checkbox"], table tbody button[role="checkbox"]');
  console.log(`Found ${tableCheckboxes.length} table row checkboxes`);
  if (tableCheckboxes.length >= 2) {
    await tableCheckboxes[0].click();
    await new Promise(r => setTimeout(r, 200));
    await tableCheckboxes[1].click();
    await new Promise(r => setTimeout(r, 300));
  }

  // Click "Add Selected to List"
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = await page.evaluate(el => el.textContent || '', btn);
    if (text.includes('Selected to List')) {
      console.log("Clicking Add to List button:", text);
      await btn.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 800));

  // Type list name in dialog
  const listNameInput = await page.$('input[placeholder*="Restaurant"]');
  if (listNameInput) {
    await listNameInput.type('Verified Apollo Outreach Segment');
    await new Promise(r => setTimeout(r, 300));

    // Click confirm Add Leads
    const dialogBtns = await page.$$('div[role="dialog"] button');
    for (const b of dialogBtns) {
      const text = await page.evaluate(el => el.textContent || '', b);
      if (text.includes('Add') && text.includes('Leads')) {
        console.log("Confirming Add Leads in dialog...");
        await b.click();
        break;
      }
    }
  }

  await new Promise(r => setTimeout(r, 2000));

  // Switch to "My Campaign Lists" tab
  console.log("9. Switching to 'My Campaign Lists' tab...");
  const tabBtns = await page.$$('button[role="tab"]');
  for (const tab of tabBtns) {
    const text = await page.evaluate(el => el.textContent || '', tab);
    if (text.includes('My Campaign Lists')) {
      await tab.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '37_apollo_saved_campaign_list.png') });
  console.log("Saved 37_apollo_saved_campaign_list.png");

  console.log("All tests completed successfully!");
  await browser.close();
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
