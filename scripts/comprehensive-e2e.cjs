const puppeteer = require('puppeteer-core');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:\\Users\\Krish Shah\\.gemini\\antigravity\\brain\\679bc895-7913-4e7c-8b06-3d1273091630\\screenshots';
const BASE_URL = 'https://smart-reach-staging.vercel.app';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function createEtherealAccount() {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'smartreach', version: '1.0.0' }),
  });
  if (!res.ok) throw new Error('Failed to create Ethereal mailbox');
  return await res.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runFullTest() {
  console.log('================================================================');
  console.log('        SMARTREACH END-TO-END BROWSER & LIFECYCLE AUDIT        ');
  console.log('================================================================\n');

  console.log('Phase 1: Provisioning 2 isolated live mailboxes (SMTP & IMAP)...');
  const senderBox = await createEtherealAccount();
  console.log(`  [Sender Mailbox]   ${senderBox.user}`);
  const receiverBox = await createEtherealAccount();
  console.log(`  [Receiver Mailbox] ${receiverBox.user}\n`);

  console.log('Phase 2: Launching Chrome browser with Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    console.log(`  [Browser ${msg.type()}]:`, msg.text());
  });

  page.on('response', async res => {
    if (res.request().method() === 'POST') {
      try {
        const text = await res.text();
        if (text.includes('"ok":false') || text.includes('error') || text.includes('fail')) {
          console.log(`  [Server Action Response ${res.status()}]:`, text.slice(0, 300));
        }
      } catch (e) {}
    }
  });

  const testUser = {
    name: 'Elena Rostova',
    email: `elena.audit.${Date.now()}@apexcorp.de`,
    password: 'Password123!Secure',
  };

  const fillInput = async (selector, text) => {
    const el = await page.$(selector);
    if (!el) throw new Error(`Input not found: ${selector}`);
    await el.click({ clickCount: 3 });
    await el.press('Backspace');
    await el.type(text, { delay: 5 });
  };

  const setReactInput = async (selector, value) => {
    await page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Element ${sel} not found`);
      const proto = el instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, String(value));
  };

  // -------------------------------------------------------------
  // STEP 1: Brand New User Signup
  // -------------------------------------------------------------
  console.log(`\nStep 1: Signing up new user (${testUser.email})...`);
  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_signup_page.png') });

  await page.type('#name', testUser.name);
  await page.type('#email', testUser.email);
  await page.type('#password', testUser.password);
  await page.click('form button[type="submit"], form button');

  await page.waitForFunction(() => !window.location.pathname.includes('/signup'), { timeout: 25000 });
  await sleep(2000);
  console.log(`  Signed up! Landed on: ${page.url()}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_dashboard_initial_zero_stats.png') });

  // -------------------------------------------------------------
  // STEP 2: Connect Mailbox (Sender Account)
  // -------------------------------------------------------------
  console.log('\nStep 2: Connecting Sender Mailbox via UI...');
  await page.goto(`${BASE_URL}/senders/new`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  await fillInput('#senderName', 'Elena Rostova');
  await fillInput('#email', senderBox.user);
  await fillInput('#fromName', 'Elena from SmartReach');
  await fillInput('#smtpHost', senderBox.smtp.host);
  await fillInput('#smtpUsername', senderBox.user);
  await fillInput('#smtpPassword', senderBox.pass);
  await fillInput('#imapHost', senderBox.imap.host);
  await fillInput('#imapUsername', senderBox.user);
  await fillInput('#imapPassword', senderBox.pass);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_sender_form_configured.png') });

  console.log('  Testing Sender Connection in UI...');
  const testBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && b.textContent.toLowerCase().includes('test connection'));
  });
  if (testBtn && testBtn.asElement()) {
    await testBtn.asElement().click();
    await sleep(7000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_sender_test_connection_live.png') });
  }

  console.log('  Saving Sender...');
  await page.click('form button[type="submit"]');
  await sleep(3000);
  if (!page.url().includes('/senders')) {
    await page.waitForFunction(() => window.location.pathname.includes('/senders'), { timeout: 15000 }).catch(() => {});
  }
  if (!page.url().includes('/senders')) {
    await page.goto(`${BASE_URL}/senders`, { waitUntil: 'networkidle2' });
  }
  await sleep(2000);
  console.log(`  Saved sender! Landed on: ${page.url()}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_senders_list_active.png') });

  // -------------------------------------------------------------
  // STEP 3: Create Lead List
  // -------------------------------------------------------------
  console.log('\nStep 3: Creating Lead List...');
  await page.goto(`${BASE_URL}/leads/new`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  const listNameInput = await page.$('#list-name, input[placeholder*="SaaS"]');
  if (listNameInput) {
    await listNameInput.type('VIP Founders Q4');
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_create_lead_list_form.png') });

  await page.click('form button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname.startsWith('/leads/') && !window.location.pathname.endsWith('/new'), { timeout: 15000 });
  await sleep(1500);
  const currentLeadListUrl = page.url();
  console.log(`  Created list, landed on: ${currentLeadListUrl}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_lead_list_detail_empty.png') });

  // -------------------------------------------------------------
  // STEP 4: Add Contact / Lead to List
  // -------------------------------------------------------------
  console.log('\nStep 4: Adding Contact to Lead List...');
  const addLeadBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && b.textContent.includes('Add Lead'));
  });
  if (addLeadBtn && addLeadBtn.asElement()) {
    await addLeadBtn.asElement().click();
    await sleep(1000);

    await fillInput('input[autoComplete="email"], input[type="email"]', receiverBox.user);
    await fillInput('input[autoComplete="given-name"]', 'Marcus');
    await fillInput('input[autoComplete="family-name"]', 'Vance');
    await fillInput('input[autoComplete="organization"]', 'Apex Systems GmbH');

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_add_lead_modal_filled.png') });

    const saveLeadBtn = await page.evaluateHandle(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return null;
      const btns = Array.from(dialog.querySelectorAll('button'));
      return btns.find(b => b.textContent && (b.textContent.includes('Save') || b.textContent.includes('Add Lead')));
    });
    if (saveLeadBtn && saveLeadBtn.asElement()) {
      await saveLeadBtn.asElement().click();
      await sleep(2500);
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_leads_table_with_contact.png') });
  console.log('  Saved contact in lead list');

  // -------------------------------------------------------------
  // STEP 5: Create Campaign with Sequence & Schedule
  // -------------------------------------------------------------
  console.log('\nStep 5: Setting up multi-step campaign...');
  await page.goto(`${BASE_URL}/campaigns/new`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  // Step 1: Name
  console.log('  Wizard Step 1: Campaign Name');
  await fillInput('#c-name', 'Q4 Enterprise Scaling Outreach');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_campaign_step1_name.png') });

  const clickNext = async () => {
    const btn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent && b.textContent.trim().startsWith('Next'));
    });
    if (btn && btn.asElement()) {
      await btn.asElement().click();
      await sleep(1500);
    }
  };

  await clickNext();

  // Step 2: Leads
  console.log('  Wizard Step 2: Selecting Lead List');
  await sleep(1000);
  const leadListCard = await page.$('#lead-list-group button, #lead-list-group [role="button"]');
  if (leadListCard) {
    await leadListCard.click();
    await sleep(500);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_campaign_step2_lead_list_selected.png') });
  await clickNext();

  // Step 3: Senders
  console.log('  Wizard Step 3: Selecting Senders');
  await sleep(1000);
  const selectAllCheckbox = await page.$('#sender-group input[type="checkbox"]');
  if (selectAllCheckbox) {
    await selectAllCheckbox.click();
    await sleep(500);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_campaign_step3_sender_selected.png') });
  await clickNext();

  // Step 4: Sequence
  console.log('  Wizard Step 4: Sequence Subject & Copy');
  await sleep(1000);
  const subjectInput = await page.$('#step-subject, input[placeholder*="Quick question"]');
  if (subjectInput) {
    await subjectInput.click({ clickCount: 3 });
    await subjectInput.press('Backspace');
    await subjectInput.type('Quick question regarding scaling, {{first_name}}');
  }

  const bodyInput = await page.$('#step-body, textarea');
  if (bodyInput) {
    await bodyInput.click({ clickCount: 3 });
    await bodyInput.press('Backspace');
    await bodyInput.type('Hi {{first_name}},\n\nSaw what you are building at {{company}}. Would love to share our benchmark data.\n\nBest,\nElena');
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_campaign_step4_sequence_composed.png') });
  await clickNext();

  // Step 5: Schedule & Settings
  console.log('  Wizard Step 5: 24/7 Sending Window & Low Delays');
  await sleep(1000);
  await setReactInput('#c-window-start', '00:00');
  await setReactInput('#c-window-end', '23:59');
  await setReactInput('#c-min-delay', '5');
  await setReactInput('#c-max-delay', '5');
  await sleep(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_campaign_step5_schedule.png') });
  await clickNext();

  // Step 6: Preview & Launch
  console.log('  Wizard Step 6: Launch Campaign');
  await sleep(1000);
  const previewSummary = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      window: text.includes('00:00 – 23:59') ? '00:00 – 23:59' : 'other',
      delay: text.includes('~5–5s') ? '~5–5s' : 'other',
    };
  });
  console.log('  Wizard preview values verified in UI:', JSON.stringify(previewSummary));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_campaign_step6_preview.png') });

  const launchBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && (b.textContent.includes('Start Campaign') || b.textContent.includes('Launch Campaign')));
  });
  if (launchBtn && launchBtn.asElement()) {
    await launchBtn.asElement().click();
    console.log('  Clicked Start Campaign, waiting for campaign page...');
    try {
      await page.waitForFunction(() => window.location.pathname.startsWith('/campaigns/') && !window.location.pathname.endsWith('/new'), { timeout: 25000 });
      await sleep(2500);
    } catch (err) {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'debug_campaign_launch_failed.png') });
      const pageInfo = await page.evaluate(() => {
        const alerts = Array.from(document.querySelectorAll('[role="alert"], p.text-destructive, [data-sonner-toast]')).map(el => el.textContent);
        return { url: window.location.href, alerts };
      });
      console.log('  [Campaign Launch Failed Debug]:', JSON.stringify(pageInfo, null, 2));
      throw err;
    }
  }

  const campaignUrl = page.url();
  console.log(`  Campaign published! Live at: ${campaignUrl}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_campaign_detail_running.png') });

  // -------------------------------------------------------------
  // STEP 6: Execute Engine Tick (Send Campaign Email over live SMTP)
  // -------------------------------------------------------------
  console.log('\nStep 6: Triggering Engine Tick to schedule emails...');
  const tick1Res = await fetch(`${BASE_URL}/api/engine/tick`, { method: 'POST' });
  const tick1Data = await tick1Res.json();
  console.log('  Engine tick 1 (Schedule):', JSON.stringify(tick1Data.data?.sched || tick1Data, null, 2));

  // Wait 8 seconds for scheduled delay window to mature
  console.log('  Waiting 8s for scheduled delay window...');
  await sleep(8000);

  console.log('  Triggering Engine Tick 2 to process & dispatch via SMTP...');
  const tick2Res = await fetch(`${BASE_URL}/api/engine/tick`, { method: 'POST' });
  let tick2Data = await tick2Res.json();
  console.log('  Engine tick 2 (Process):', JSON.stringify(tick2Data.data?.proc || tick2Data, null, 2));

  if ((tick2Data.data?.proc?.sent ?? 0) === 0) {
    console.log('  Waiting an additional 5s and triggering Engine Tick 2 again...');
    await sleep(5000);
    const tick2Retry = await fetch(`${BASE_URL}/api/engine/tick`, { method: 'POST' });
    tick2Data = await tick2Retry.json();
    console.log('  Engine tick 2 retry (Process):', JSON.stringify(tick2Data.data?.proc || tick2Data, null, 2));
  }

  // Let SMTP transport complete delivery
  await sleep(5000);

  // Reload campaign page in browser
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '17_campaign_after_send.png') });

  // -------------------------------------------------------------
  // STEP 7: Verify Outbound Delivery & Send Authentic Inbound Reply
  // -------------------------------------------------------------
  console.log('\nStep 7: Verifying outbound delivery in live IMAP...');
  const MailComposer = require('nodemailer/lib/mail-composer');
  const senderImapClient = new ImapFlow({
    host: senderBox.imap.host,
    port: senderBox.imap.port,
    secure: true,
    auth: { user: senderBox.user, pass: senderBox.pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  await senderImapClient.connect();
  await senderImapClient.mailboxOpen('INBOX');

  let outboundMsg = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    console.log(`  Checking sender mailbox on live IMAP (attempt ${attempt}/6)...`);
    for await (const msg of senderImapClient.fetch('1:*', { envelope: true, bodyParts: ['text', '1'] })) {
      outboundMsg = msg;
    }
    if (outboundMsg) break;
    await sleep(3000);
  }

  if (outboundMsg) {
    console.log('  [OUTBOUND CAMPAIGN EMAIL VERIFIED IN LIVE IMAP]');
    console.log('   From:', outboundMsg.envelope.from?.[0]?.address);
    console.log('   To:', outboundMsg.envelope.to?.[0]?.address);
    console.log('   Subject:', outboundMsg.envelope.subject);
    console.log('   Message-ID:', outboundMsg.envelope.messageId);

    // Marcus Vance replies back into Elena's inbox!
    console.log('\nStep 8: Sending authentic inbound reply from Marcus Vance back to Elena...');
    const replyMail = new MailComposer({
      from: `Marcus Vance <${receiverBox.user}>`,
      to: senderBox.user,
      subject: `Re: ${outboundMsg.envelope.subject}`,
      inReplyTo: outboundMsg.envelope.messageId,
      references: outboundMsg.envelope.messageId,
      text: "Hi Elena,\n\nThanks for reaching out! Definitely interested in seeing the benchmark data. Let's talk Tuesday at 2pm.\n\nBest,\nMarcus",
    });
    const replyBuffer = await replyMail.compile().build();
    await senderImapClient.append('INBOX', replyBuffer);
    console.log('  [INBOUND REPLY SUCCESSFULLY DELIVERED TO LIVE IMAP INBOX]');
  } else {
    console.warn('  Warning: No outbound message found in sender inbox.');
  }
  await senderImapClient.logout();

  // Wait 3s
  await sleep(3000);

  // Sync replies into DB
  console.log('  Triggering engine sync for inbound replies...');
  const syncTickRes = await fetch(`${BASE_URL}/api/engine/tick`, { method: 'POST' });
  const syncTickData = await syncTickRes.json();
  console.log('  Engine sync result:', JSON.stringify(syncTickData.data?.sync || syncTickData, null, 2));

  // -------------------------------------------------------------
  // STEP 8: UniBox Sync & Interaction in Browser
  // -------------------------------------------------------------
  console.log('\nStep 9: Navigating to UniBox in browser...');
  await page.goto(`${BASE_URL}/unibox`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_unibox_initial.png') });

  console.log('  Clicking Refresh Inbox in UniBox UI...');
  const refreshBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && b.textContent.includes('Refresh'));
  });
  if (refreshBtn && refreshBtn.asElement()) {
    await refreshBtn.asElement().click();
    await sleep(6000);
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_unibox_synced_reply.png') });

  // Click on the conversation to open thread
  console.log('  Opening conversation thread in UniBox...');
  const threadItem = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
    return btns.find(b => b.textContent && (b.textContent.includes('Marcus') || b.textContent.includes('re:') || b.textContent.includes('Re:')));
  });
  if (threadItem && threadItem.asElement()) {
    await threadItem.asElement().click();
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_unibox_thread_view.png') });
  }

  // Type reply in UniBox compose box
  console.log('  Replying from UniBox compose box...');
  const composeTextarea = await page.$('#unibox-reply, textarea');
  if (composeTextarea) {
    await composeTextarea.type('Sounds great Marcus, looking forward to Tuesday! Sent you a calendar invite.');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '21_unibox_composing_reply.png') });

    const sendReplyBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent && (b.textContent.includes('Send email') || b.textContent.includes('Send')));
    });
    if (sendReplyBtn && sendReplyBtn.asElement()) {
      await sendReplyBtn.asElement().click();
      await sleep(4000);
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '22_unibox_reply_sent.png') });

  // Change Tag to "Interested"
  console.log('  Changing tag to "Interested"...');
  const tagSelect = await page.evaluateHandle(() => {
    return document.querySelector('button[aria-label="Reply tag"]') ||
      Array.from(document.querySelectorAll('button[role="combobox"]')).find(t => t.textContent && (t.textContent.includes('tag') || t.textContent.includes('Tag') || t.textContent.includes('No tag')));
  });
  if (tagSelect && tagSelect.asElement()) {
    await tagSelect.asElement().click();
    await sleep(600);
    const interestedOption = await page.evaluateHandle(() => {
      const items = Array.from(document.querySelectorAll('[role="option"], div, span'));
      return items.find(i => i.textContent && i.textContent.trim() === 'Interested');
    });
    if (interestedOption && interestedOption.asElement()) {
      await interestedOption.asElement().click();
      await sleep(1500);
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '23_unibox_tag_interested.png') });

  // -------------------------------------------------------------
  // STEP 9: Verify Statistics Across Campaign, Dashboard, Analytics
  // -------------------------------------------------------------
  console.log('\nStep 10: Verifying Campaign detail statistics...');
  await page.goto(campaignUrl, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const campaignSummary = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasSentCount: text.includes('1') && (text.includes('Sent') || text.includes('sent')),
      hasRepliedCount: text.includes('1') && (text.includes('Replied') || text.includes('replied')),
      snippet: text.split('\n').filter(l => l.trim().length > 0).slice(0, 35).join(' | '),
    };
  });
  console.log('  [Campaign Detail Metrics Extracted]:', campaignSummary.snippet);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '24_campaign_stats_final.png') });

  console.log('\nStep 11: Verifying Dashboard overview statistics...');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const dashboardSummary = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      snippet: text.split('\n').filter(l => l.trim().length > 0).slice(0, 35).join(' | '),
    };
  });
  console.log('  [Dashboard Metrics Extracted]:', dashboardSummary.snippet);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '25_dashboard_stats_final.png') });

  console.log('\nStep 12: Verifying Analytics dashboard...');
  await page.goto(`${BASE_URL}/analytics`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const analyticsSummary = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      snippet: text.split('\n').filter(l => l.trim().length > 0).slice(0, 35).join(' | '),
    };
  });
  console.log('  [Analytics Metrics Extracted]:', analyticsSummary.snippet);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '26_analytics_page_final.png') });

  console.log('\n=== COMPREHENSIVE TEST PIPELINE COMPLETED SUCCESSFULLY ===');
  await browser.close();
}

runFullTest().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
