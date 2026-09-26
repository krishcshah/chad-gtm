const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://smart-reach-staging.vercel.app';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function run() {
  console.log("Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1000'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const testUser = {
    name: 'Elena Rostova',
    email: `elena.ai.${Date.now()}@smartreach-demo.com`,
    password: 'Password123!Secure',
  };

  console.log(`1. Navigating to ${BASE_URL}/signup...`);
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);
  await page.click('form button');

  console.log("Waiting for dashboard redirect...");
  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 15000 });
  console.log("Current URL:", page.url());

  // 2. Visit Settings to inspect AI Settings Card & Model Selector
  console.log("2. Navigating to /settings...");
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '27_ai_settings_card.png'), fullPage: true });
  console.log("Saved 27_ai_settings_card.png");

  // Click OpenAI tab to verify OpenAI models
  console.log("Switching to OpenAI provider tab...");
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('OpenAI')) {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '28_ai_settings_openai_models.png'), fullPage: true });
  console.log("Saved 28_ai_settings_openai_models.png");

  // 3. Visit Campaign Wizard to inspect Step 4 Sequence & AI On-the-Fly card
  console.log("3. Navigating to /campaigns/new...");
  await page.goto(`${BASE_URL}/campaigns/new`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Step 1: Campaign name
  const nameInput = await page.$('input[placeholder*="Campaign"], input#campaign-name, input[type="text"]');
  if (nameInput) {
    await nameInput.type("Frontier AI Enterprise Sequence");
  }

  // Click Next until Step 4
  console.log("Advancing wizard to Step 4 (Sequence)...");
  for (let s = 1; s <= 3; s++) {
    const nextBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent.includes('Next') || b.textContent.includes('Continue'));
    });
    if (nextBtn) {
      await nextBtn.asElement().click();
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '29_campaign_step4_ai_composer.png'), fullPage: true });
  console.log("Saved 29_campaign_step4_ai_composer.png");

  // Enable "Write scripts on the fly"
  console.log("Toggling 'Write scripts on the fly' switch...");
  const switchEl = await page.$('button[role="switch"], [aria-label*="Toggle write scripts on the fly"]');
  if (switchEl) {
    await switchEl.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '30_ai_on_the_fly_card_enabled.png'), fullPage: true });
    console.log("Saved 30_ai_on_the_fly_card_enabled.png");

    // Click "Preview 10 Sample Emails" button
    console.log("Clicking 'Preview 10 Sample Emails'...");
    const previewBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent.includes('Preview 10 Sample Emails'));
    });

    if (previewBtn && previewBtn.asElement()) {
      await previewBtn.asElement().click();
      console.log("Waiting for 10-sample preview modal to generate...");
      await new Promise(r => setTimeout(r, 3000));

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '31_ai_10_samples_preview_modal.png'), fullPage: false });
      console.log("Saved 31_ai_10_samples_preview_modal.png");
    }
  }

  await browser.close();
  console.log("Browser test completed successfully!");
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
