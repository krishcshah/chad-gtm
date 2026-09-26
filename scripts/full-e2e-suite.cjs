const puppeteer = require('puppeteer-core');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://smart-reach-staging.vercel.app';

async function createEtherealAccount() {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'smartreach', version: '1.0.0' }),
  });
  if (!res.ok) throw new Error(`Failed to create Ethereal account: ${res.statusText}`);
  return await res.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== STARTING FULL END-TO-END BROWSER & EMAIL PIPELINE TEST ===\n');

  console.log('1. Provisioning 2 live Ethereal mailboxes over the internet...');
  const senderBox = await createEtherealAccount();
  console.log(`   [Sender Mailbox]   ${senderBox.user}`);
  const receiverBox = await createEtherealAccount();
  console.log(`   [Receiver Mailbox] ${receiverBox.user}`);

  console.log('\n2. Launching Chrome browser with Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('React DevTools')) {
      console.log('   [PAGE ERROR LOG]:', msg.text());
    }
  });

  const testUser = {
    name: 'Elena Rostova',
    email: `elena.founder.${Date.now()}@apexreach.de`,
    password: 'Password123!Secure',
  };

  console.log(`\n3. Signing up brand new user: ${testUser.email}...`);
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_signup_page.png') });

  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);
  await page.click('form button');

  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 25000 });
  console.log(`   Landed on: ${page.url()}`);
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_dashboard_empty.png') });

  console.log('\n4. Connecting Sender Mailbox via UI...');
  await page.goto(`${BASE_URL}/senders/new`, { waitUntil: 'networkidle2' });
  await sleep(1000);

  // Fill in Sender details
  await page.evaluate((sender) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const findByPlaceholder = (ph) => inputs.find(i => i.placeholder && i.placeholder.includes(ph));

    const nameInput = document.querySelector('#senderName') || findByPlaceholder('Krish Shah');
    if (nameInput) {
      nameInput.value = 'Elena from SmartReach';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const emailInput = document.querySelector('#email') || inputs.find(i => i.type === 'email');
    if (emailInput) {
      emailInput.value = sender.user;
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const smtpHost = document.querySelector('#smtpHost') || findByPlaceholder('smtp.gmail.com');
    if (smtpHost) {
      smtpHost.value = sender.smtp.host;
      smtpHost.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const smtpPort = document.querySelector('#smtpPort') || inputs.find(i => i.value === '587');
    if (smtpPort) {
      smtpPort.value = '587';
      smtpPort.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const usernames = inputs.filter(i => i.placeholder && i.placeholder.includes('krish@yourdomain.com'));
    if (usernames[0]) {
      usernames[0].value = sender.user;
      usernames[0].dispatchEvent(new Event('input', { bubbles: true }));
    }

    const passwords = inputs.filter(i => i.type === 'password');
    if (passwords[0]) {
      passwords[0].value = sender.pass;
      passwords[0].dispatchEvent(new Event('input', { bubbles: true }));
    }

    const imapHost = document.querySelector('#imapHost') || findByPlaceholder('imap.gmail.com');
    if (imapHost) {
      imapHost.value = sender.imap.host;
      imapHost.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const imapPort = document.querySelector('#imapPort') || inputs.find(i => i.value === '993');
    if (imapPort) {
      imapPort.value = '993';
      imapPort.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (usernames[1]) {
      usernames[1].value = sender.user;
      usernames[1].dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (passwords[1]) {
      passwords[1].value = sender.pass;
      passwords[1].dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, senderBox);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_sender_form_filled.png') });

  // Test connection button
  console.log('   Testing Sender Connection in UI...');
  const testBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && b.textContent.toLowerCase().includes('test connection'));
  });

  if (testBtn && testBtn.asElement()) {
    await testBtn.asElement().click();
    console.log('   Waiting for test connection result...');
    await sleep(4000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_sender_test_result.png') });
  }

  // Submit sender form
  console.log('   Submitting sender form...');
  const saveBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && (b.textContent.includes('Add Sender') || b.textContent.includes('Save') || b.textContent.includes('Connect')));
  });
  if (saveBtn && saveBtn.asElement()) {
    await saveBtn.asElement().click();
  }

  await page.waitForFunction(() => page.url().endsWith('/senders'), { timeout: 15000 }).catch(() => {});
  await sleep(2000);
  console.log(`   Current URL: ${page.url()}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_senders_list_active.png') });

  console.log('\n5. Creating a Contact List...');
  await page.goto(`${BASE_URL}/leads/new`, { waitUntil: 'networkidle2' });
  await sleep(1000);
  await page.type('input[name="name"], #name', 'Founders Alpha List');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_new_lead_list_form.png') });

  const createListBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && (b.textContent.includes('Create') || b.textContent.includes('Save')));
  });
  if (createListBtn && createListBtn.asElement()) {
    await createListBtn.asElement().click();
  }
  await sleep(2500);

  // Go to leads page to view the new list
  await page.goto(`${BASE_URL}/leads`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_leads_lists_view.png') });

  // Get list ID from card link or url
  const listHref = await page.evaluate(() => {
    const link = document.querySelector('a[href^="/leads/"]');
    return link ? link.getAttribute('href') : null;
  });
  console.log(`   Found list link: ${listHref}`);

  console.log('\n6. Adding Lead to the list...');
  // We can add a lead to this list directly via the list page or import
  if (listHref) {
    await page.goto(`${BASE_URL}${listHref}`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_lead_list_empty.png') });

    // Click "Add Lead" button if present
    const addLeadBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent && b.textContent.includes('Add Lead'));
    });
    if (addLeadBtn && addLeadBtn.asElement()) {
      await addLeadBtn.asElement().click();
      await sleep(1000);
      await page.type('input[name="email"], #email', receiverBox.user);
      await page.type('input[name="firstName"], #firstName', 'Marcus');
      await page.type('input[name="lastName"], #lastName', 'Vance');
      await page.type('input[name="company"], #company', 'Apex Systems GmbH');
      await page.type('input[name="jobTitle"], #jobTitle', 'Chief Technology Officer');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_add_lead_modal.png') });

      const saveLeadBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.textContent && (b.textContent.includes('Save') || b.textContent.includes('Add Lead')));
      });
      if (saveLeadBtn && saveLeadBtn.asElement()) {
        await saveLeadBtn.asElement().click();
        await sleep(2000);
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_leads_table_with_contact.png') });
  }

  console.log('\n7. Setting up Campaign...');
  await page.goto(`${BASE_URL}/campaigns/new`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_campaign_wizard_step1.png') });

  // Wizard Step 1: Name and Audience
  await page.type('input[name="name"], #name', 'Q4 Executive Outreach');
  
  // Select the lead list
  const listSelect = await page.$('select[name="leadListId"]');
  if (listSelect) {
    const listVal = await page.evaluate(() => {
      const opt = document.querySelector('select[name="leadListId"] option:not([value=""])');
      return opt ? opt.value : null;
    });
    if (listVal) await listSelect.select(listVal);
  }

  // Next step
  const nextStepBtn = async () => {
    const btn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent && (b.textContent.includes('Next') || b.textContent.includes('Continue')));
    });
    if (btn && btn.asElement()) {
      await btn.asElement().click();
      await sleep(1500);
    }
  };

  await nextStepBtn();
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_campaign_wizard_step2.png') });

  // If there's an email sequence editor step:
  const subjectInput = await page.$('input[placeholder*="Subject"], input[name="subject"], #subject');
  if (subjectInput) {
    await subjectInput.type('Quick question regarding Apex Systems scaling, {{first_name}}');
  }
  const bodyTextarea = await page.$('textarea[name="body"], textarea');
  if (bodyTextarea) {
    await bodyTextarea.type('Hi {{first_name}},\n\nNoticed what you are building at {{company}}. Would love to share our benchmark data.\n\nBest,\nElena');
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_campaign_sequence_composed.png') });

  await nextStepBtn();
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_campaign_wizard_step3.png') });

  // Attach sender if on senders step
  const senderCheckbox = await page.$('input[type="checkbox"]');
  if (senderCheckbox) {
    await senderCheckbox.click();
  }

  await nextStepBtn();
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_campaign_wizard_review.png') });

  // Launch campaign
  const launchBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && (b.textContent.includes('Launch') || b.textContent.includes('Publish') || b.textContent.includes('Start Campaign')));
  });
  if (launchBtn && launchBtn.asElement()) {
    console.log('   Clicking Launch Campaign...');
    await launchBtn.asElement().click();
    await sleep(3000);
  }

  console.log(`   Landed on: ${page.url()}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_campaign_detail_published.png') });

  console.log('\n=== PRELIMINARY BROWSER RUN COMPLETE ===');
  await browser.close();
}

main().catch(err => {
  console.error('Fatal error in main:', err);
  process.exit(1);
});
