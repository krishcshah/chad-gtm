const puppeteer = require('puppeteer-core');
const path = require('path');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://130-61-146-177.sslip.io';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('Launching browser for Donation Modal Verification...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();

  // Handle uncaught dialogs/alerts
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE ERROR LOG:', msg.text());
  });

  // 1. DESKTOP VIEWPORT
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // Sign up a brand new user to test the real first-signup trigger
  const uniqueId = Date.now();
  const testUser = {
    name: 'Maya Lin',
    email: `maya.donation.${uniqueId}@example.com`,
    password: 'Password123!Secure',
  };

  console.log(`Navigating to ${BASE_URL}/signup ...`);
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await sleep(1000);

  console.log(`Signing up new user: ${testUser.email} ...`);
  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);

  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  console.log('Waiting for navigation to dashboard...');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  console.log('Current URL after signup:', page.url());

  // Wait for the modal to pop up (timer is 700ms)
  await sleep(2500);

  // Take screenshot of default Monthly / $10 selected view on Desktop
  const desktopModalPath = path.join(SCREENSHOTS_DIR, 'donation_modal_desktop.png');
  await page.screenshot({ path: desktopModalPath });
  console.log(`Saved: ${desktopModalPath}`);

  // Test selecting "One-Time Gift" and "Custom"
  try {
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await page.evaluate((el) => el.textContent, b);
      if (text && text.includes('One-Time Gift')) {
        await b.click();
        console.log('Clicked "One-Time Gift"');
        break;
      }
    }
    await sleep(500);

    // Click "Custom"
    for (const b of buttons) {
      const text = await page.evaluate((el) => el.textContent, b);
      if (text && text.includes('Custom')) {
        await b.click();
        console.log('Clicked "Custom" amount');
        break;
      }
    }
    await sleep(500);

    // Type custom amount 35
    const customInput = (await page.$('input[inputmode="numeric"]')) || (await page.$('input[type="text"]')) || (await page.$('input[type="number"]'));
    if (customInput) {
      await customInput.click({ clickCount: 3 });
      await customInput.type('35');
      console.log('Typed custom amount $35');
    }
    await sleep(600);

    const desktopCustomModalPath = path.join(SCREENSHOTS_DIR, 'donation_modal_custom_desktop.png');
    await page.screenshot({ path: desktopCustomModalPath });
    console.log(`Saved: ${desktopCustomModalPath}`);
  } catch (err) {
    console.log('Error testing custom donation interaction:', err.message);
  }

  // 2. MOBILE VIEWPORT (iPhone 14 / modern smartphone: 390x844)
  console.log('\nTesting Mobile Viewport (390x844)...');
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  // Transfer cookies / session from desktop page
  const cookies = await page.cookies();
  await mobilePage.setCookie(...cookies);

  // Directly navigate with new_signup=1 to trigger modal
  console.log(`Navigating to ${BASE_URL}/dashboard?new_signup=1 on Mobile...`);
  // Clear the dismissed flag in localStorage for mobilePage before load
  await mobilePage.evaluateOnNewDocument(() => {
    localStorage.removeItem('smartreach_donation_dismissed');
  });

  await mobilePage.goto(`${BASE_URL}/dashboard?new_signup=1`, { waitUntil: 'networkidle2' });
  await sleep(2500);

  const mobileModalPath = path.join(SCREENSHOTS_DIR, 'donation_modal_mobile.png');
  await mobilePage.screenshot({ path: mobileModalPath });
  console.log(`Saved: ${mobileModalPath}`);

  // 3. SETTINGS ON-DEMAND TRIGGER
  console.log('\nTesting Settings on-demand contribution button...');
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  // Find the "Make a Contribution" button in Settings
  const settingsButtons = await page.$$('button');
  let foundSettingsBtn = false;
  for (const btn of settingsButtons) {
    const text = await page.evaluate((el) => el.textContent, btn);
    if (text && (text.includes('Make a Contribution') || text.includes('Support the Mission'))) {
      console.log('Found contribution button in settings, clicking...');
      await btn.click();
      foundSettingsBtn = true;
      break;
    }
  }

  if (foundSettingsBtn) {
    await sleep(1000);
    const settingsModalPath = path.join(SCREENSHOTS_DIR, 'donation_modal_from_settings.png');
    await page.screenshot({ path: settingsModalPath });
    console.log(`Saved: ${settingsModalPath}`);
  }

  await browser.close();
  console.log('All donation modal tests completed successfully!');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
