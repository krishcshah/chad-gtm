/**
 * Production Seed Script for SmartReach Demo Account
 * 
 * Account Credentials:
 *   Email:    demo@ratecompany.com
 *   Password: demo123
 * 
 * Features Populated:
 *   - User: demo@ratecompany.com, Password: demo123
 *   - Workspace: RateCompany Outreach (Default workspace)
 *   - Compliance settings: RateCompany Technologies GmbH, Berlin
 *   - 6 Connected active sender mailboxes with warmup health, signatures, daily stats
 *   - 5 Lead lists with 7,750+ realistic leads total
 *   - 7 Rich campaigns (running & completed) with sequences, steps, variants & metrics
 *   - 18 Threaded UniBox conversations (interested, meetings booked, not interested, OOO, operator replies)
 *   - ~4,500 sent/bounced email jobs & replies across past 60 days + future 90 days for continuous graph activity
 *   - 5 High-converting email templates
 *   - 30 Activity logs for live dashboard feed
 *   - Suppressions list
 */

const { Pool } = require('pg');
const { hashPassword } = require('better-auth/crypto');
const crypto = require('crypto');

const DEMO_EMAIL = 'demo@ratecompany.com';
const DEMO_PASSWORD = 'demo123';
const DEMO_USER_ID = 'usr_demo_ratecompany';
const DEMO_WORKSPACE_ID = 'ws_demo_ratecompany';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://smartreach_user:17e808d5ab8c28f4875c2c4d8f6ee0c562592646ccb73e0c@127.0.0.1:5432/smartreach';

const pool = new Pool({
  connectionString: DATABASE_URL,
});

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const FIRST_NAMES = [
  'Markus', 'Elena', 'David', 'Sophie', 'Julian', 'Sarah', 'Thomas', 'Laura',
  'Alexander', 'Anna', 'Michael', 'Lisa', 'Robert', 'Clara', 'Daniel', 'Hannah',
  'Johannes', 'Felix', 'Christina', 'Maximilian', 'Julia', 'Sebastian', 'Katharina',
  'Niklas', 'Franziska', 'Jan', 'Marie', 'Tim', 'Leon', 'Tobias'
];

const LAST_NAMES = [
  'Weber', 'Schmidt', 'Miller', 'Becker', 'Koch', 'Jenkins', 'Meyer', 'Fischer',
  'Wagner', 'Schulz', 'Brown', 'Klein', 'Vance', 'Richter', 'Müller', 'Zhao',
  'Rostova', 'Wolf', 'Hoffmann', 'Schäfer', 'Bauer', 'Hartmann', 'Zimmermann',
  'Krüger', 'Lange', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Huber'
];

const COMPANIES = [
  'CloudScale Systems', 'ByteLogic Technologies', 'FinFlow Software', 'ApexData AI',
  'DataSphere AG', 'Optima Digital', 'Zenith Media GmbH', 'Stratos Cloud', 'NexaCorp',
  'AlphaVentures', 'OmniSoft Solutions', 'Vector Labs', 'BluePeak Group', 'MetaPoint',
  'GreenTech Innovations', 'NovaCorp Labs', 'CloudBase Systems', 'Synthetix AI',
  'Kvantum Robotics', 'Hyperion Dynamics', 'Aether Networks', 'Vanguard Security'
];

const TITLES = [
  'Founder & CEO', 'Co-Founder & CTO', 'VP of Sales', 'Head of Growth',
  'Director of RevOps', 'VP of Marketing', 'Head of Business Development',
  'Chief Revenue Officer', 'Head of Demand Gen', 'Director of Engineering'
];

const CITIES = [
  'Berlin, Germany', 'Munich, Germany', 'Frankfurt, Germany', 'Hamburg, Germany',
  'Zurich, Switzerland', 'Vienna, Austria', 'London, UK', 'San Francisco, CA',
  'New York, NY', 'Austin, TX', 'Stockholm, Sweden', 'Amsterdam, Netherlands'
];

const INDUSTRIES = [
  'B2B SaaS', 'FinTech', 'Cloud Infrastructure', 'E-Commerce Tech', 'AI & Machine Learning',
  'Cybersecurity', 'Enterprise Software', 'DevOps & Tooling'
];

async function seed() {
  console.log('--- Starting SmartReach Demo Account Seeding ---');
  console.log(`Target: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Clean up existing demo data
    console.log('1. Cleaning up existing demo data...');
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [DEMO_EMAIL]);
    if (existingUser.rows.length > 0) {
      const uId = existingUser.rows[0].id;
      await client.query('DELETE FROM unibox_messages WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM replies WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM email_jobs WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1)', [uId]);
      await client.query('DELETE FROM campaign_leads WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1)', [uId]);
      await client.query('DELETE FROM campaign_senders WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1)', [uId]);
      await client.query('DELETE FROM sequence_step_variants WHERE step_id IN (SELECT id FROM sequence_steps WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1))', [uId]);
      await client.query('DELETE FROM sequence_steps WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1)', [uId]);
      await client.query('DELETE FROM campaigns WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM leads WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM lead_lists WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM sender_accounts WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM activity_logs WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM usage_counters WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM suppressions WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM email_templates WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM workspace_settings WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM workspaces WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM accounts WHERE user_id = $1', [uId]);
      await client.query('DELETE FROM users WHERE id = $1', [uId]);
    }

    // 2. Create User & Credential Account
    console.log('2. Creating User & Authentication record...');
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [DEMO_USER_ID, 'Demo User · RateCompany', DEMO_EMAIL, true]
    );

    await client.query(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [crypto.randomUUID(), DEMO_USER_ID, 'credential', DEMO_USER_ID, passwordHash]
    );

    // 3. Create Workspace & Compliance Settings
    console.log('3. Creating Workspace & Settings...');
    const nowIso = new Date().toISOString();
    await client.query(
      `INSERT INTO workspaces (id, user_id, name, description, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        DEMO_WORKSPACE_ID,
        DEMO_USER_ID,
        'RateCompany Outreach',
        'Primary B2B outbound & customer acquisition workspace',
        true,
        nowIso,
        nowIso,
      ]
    );

    await client.query(
      `INSERT INTO workspace_settings (user_id, workspace_id, company_name, postal_address, unsubscribe_base_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET workspace_id = $2, company_name = $3, postal_address = $4`,
      [
        DEMO_USER_ID,
        DEMO_WORKSPACE_ID,
        'RateCompany Technologies GmbH',
        'Torstraße 140, 10119 Berlin, Germany',
        'https://130-61-146-177.sslip.io/unsubscribe',
        nowIso,
        nowIso,
      ]
    );

    // 4. Create 6 Connected Sender Accounts
    console.log('4. Creating 6 Connected Senders...');
    const sendersConfig = [
      {
        id: 'snd_demo_1',
        senderName: 'Alex Vance',
        email: 'alex.v@ratecompany.com',
        fromName: 'Alex Vance · RateCompany',
        dailyLimit: 50,
        health: 99,
        todayCount: 42,
        sig: '<p style="font-family:sans-serif;font-size:12px;color:#666;"><strong>Alex Vance</strong><br>VP Enterprise Growth · RateCompany<br>Berlin · San Francisco</p>'
      },
      {
        id: 'snd_demo_2',
        senderName: 'Sarah Miller',
        email: 'sarah.m@ratecompany.com',
        fromName: 'Sarah Miller · EMEA Lead',
        dailyLimit: 50,
        health: 98,
        todayCount: 38,
        sig: '<p style="font-family:sans-serif;font-size:12px;color:#666;"><strong>Sarah Miller</strong><br>Director of Strategic Sales · RateCompany<br>London · Frankfurt</p>'
      },
      {
        id: 'snd_demo_3',
        senderName: 'RateCompany Growth',
        email: 'growth@ratecompany.com',
        fromName: 'RateCompany Growth Team',
        dailyLimit: 50,
        health: 96,
        todayCount: 45,
        sig: '<p style="font-family:sans-serif;font-size:12px;color:#666;"><strong>RateCompany Growth</strong><br>Outreach & Partnerships<br>ratecompany.com</p>'
      },
      {
        id: 'snd_demo_4',
        senderName: 'Krish Shah',
        email: 'krish@ratecompany.com',
        fromName: 'Krish Shah · Founder',
        dailyLimit: 40,
        health: 100,
        todayCount: 28,
        sig: '<p style="font-family:sans-serif;font-size:12px;color:#666;"><strong>Krish Shah</strong><br>Founder & Head of Product · RateCompany</p>'
      },
      {
        id: 'snd_demo_5',
        senderName: 'Marcus Koch',
        email: 'marcus.k@ratecompany.de',
        fromName: 'Marcus Koch · DACH Partnerships',
        dailyLimit: 50,
        health: 97,
        todayCount: 34,
        sig: '<p style="font-family:sans-serif;font-size:12px;color:#666;"><strong>Marcus Koch</strong><br>DACH Lead Partnerships · RateCompany Deutschland</p>'
      },
      {
        id: 'snd_demo_6',
        senderName: 'CloudScale Partnerships',
        email: 'partnerships@ratecompany-cloud.com',
        fromName: 'RateCompany Cloud Outreach',
        dailyLimit: 50,
        health: 95,
        todayCount: 40,
        sig: '<p style="font-family:sans-serif;font-size:12px;color:#666;"><strong>RateCompany Cloud Partnerships</strong><br>Infrastructure & Integration</p>'
      },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const s of sendersConfig) {
      await client.query(
        `INSERT INTO sender_accounts (
          id, user_id, workspace_id, sender_name, email, smtp_host, smtp_port, smtp_username, smtp_password_enc,
          smtp_security, imap_host, imap_port, imap_username, imap_password_enc, daily_limit, hourly_limit,
          from_name, reply_to, timezone, signature, status, health, smtp_status, imap_status, last_sync_at,
          replied_count, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'smtp.ratecompany.com', 587, $5, 'enc_demo_smtp_sec',
          'tls', 'imap.ratecompany.com', 993, $5, 'enc_demo_imap_sec', $6, 12,
          $7, $5, 'Europe/Berlin', $8, 'active', $9, 'ok', 'ok', $10,
          $11, $12, $12
        )`,
        [
          s.id,
          DEMO_USER_ID,
          DEMO_WORKSPACE_ID,
          s.senderName,
          s.email,
          s.dailyLimit,
          s.fromName,
          s.sig,
          s.health,
          nowIso,
          s.todayCount,
          nowIso,
        ]
      );

      // Usage counter for today so daily limits show active numbers in UI
      await client.query(
        `INSERT INTO usage_counters (id, user_id, entity_type, entity_id, date, count)
         VALUES ($1, $2, 'sender', $3, $4, $5)
         ON CONFLICT (entity_type, entity_id, date) DO UPDATE SET count = $5`,
        [crypto.randomUUID(), DEMO_USER_ID, s.id, todayStr, s.todayCount]
      );
    }

    // 5. Create 5 Lead Lists
    console.log('5. Creating 5 Lead Lists & 7,750+ Leads...');
    const listsConfig = [
      { id: 'lst_demo_1', name: 'DACH Tech Founders & C-Levels', count: 1850 },
      { id: 'lst_demo_2', name: 'US SaaS VPs of Sales & RevOps', count: 1650 },
      { id: 'lst_demo_3', name: 'High-Growth DTC & E-Commerce Brands', count: 1450 },
      { id: 'lst_demo_4', name: 'Global Outbound & Demand Gen Agencies', count: 1550 },
      { id: 'lst_demo_5', name: 'European Fintech Product & Eng Directors', count: 1250 },
    ];

    const leadListMap = {}; // listId -> Array of lead objects

    for (const l of listsConfig) {
      await client.query(
        `INSERT INTO lead_lists (id, user_id, workspace_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [l.id, DEMO_USER_ID, DEMO_WORKSPACE_ID, l.name, nowIso]
      );

      leadListMap[l.id] = [];
      console.log(`   Generating ${l.count} leads for: "${l.name}"...`);

      const chunkSize = 500;
      for (let offset = 0; offset < l.count; offset += chunkSize) {
        const currentBatchSize = Math.min(chunkSize, l.count - offset);
        const values = [];
        const params = [];

        for (let i = 0; i < currentBatchSize; i++) {
          const globalIdx = offset + i + 1;
          const leadId = `lead_${l.id}_${globalIdx}`;
          const fn = randomChoice(FIRST_NAMES);
          const ln = randomChoice(LAST_NAMES);
          const comp = randomChoice(COMPANIES);
          const domain = comp.toLowerCase().replace(/[^a-z0-9]/g, '') + '.io';
          const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${globalIdx}@${domain}`;
          const title = randomChoice(TITLES);
          const city = randomChoice(CITIES);
          const ind = randomChoice(INDUSTRIES);

          let status = 'contacted';
          const rand = Math.random();
          if (rand < 0.12) status = 'replied';
          else if (rand < 0.28) status = 'new';
          else if (rand < 0.33) status = 'bounced';

          leadListMap[l.id].push({ id: leadId, email, fn, ln, comp, title, listId: l.id });

          params.push(
            leadId,
            DEMO_USER_ID,
            DEMO_WORKSPACE_ID,
            l.id,
            email,
            fn,
            ln,
            comp,
            `https://${domain}`,
            `https://linkedin.com/in/${fn.toLowerCase()}-${ln.toLowerCase()}`,
            title,
            city,
            ind,
            status,
            nowIso,
            nowIso
          );

          const base = i * 16;
          values.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16})`
          );
        }

        const queryText = `
          INSERT INTO leads (
            id, user_id, workspace_id, list_id, email, first_name, last_name, company,
            website, linkedin, job_title, location, industry, status, created_at, updated_at
          ) VALUES ${values.join(',')}
        `;
        await client.query(queryText, params);
      }
    }

    // 6. Create 7 Rich Campaigns
    console.log('6. Creating 7 Campaigns with sequences & steps...');
    const campaignsConfig = [
      {
        id: 'cmp_demo_1',
        name: 'Q4 Enterprise SaaS Decision Makers',
        status: 'running',
        listId: 'lst_demo_1',
        steps: [
          {
            pos: 1,
            delay: 0,
            subject: 'Quick question regarding {{company}} outbound pipeline',
            text: 'Hi {{first_name}},\n\nI noticed {{company}} is rapidly scaling. Most founders we talk to struggle with mailbox deliverability once they scale past 5 inboxes.\n\nWe built SmartReach to give you unlimited mailboxes and automatic rotation with zero seat fees. Would you be open to a 10-minute demo this week?\n\nBest,\nAlex',
          },
          {
            pos: 2,
            delay: 3,
            subject: 'Re: Quick question regarding {{company}} outbound pipeline',
            text: 'Hi {{first_name}},\n\nJust bumping this in case it got buried under your inbox. Here is a quick case study of how a B2B SaaS scaled from 20 to 180 qualified meetings a month with mailbox rotation.\n\nLet me know if Thursday 2pm works for a quick walkthrough.\n\nBest,\nAlex',
          },
          {
            pos: 3,
            delay: 4,
            subject: 'Final follow up for {{company}}',
            text: 'Hi {{first_name}},\n\nI assume this is not a top priority for Q4. I will stop following up for now.\n\nIf you ever want to fix deliverability without paying per-seat subscriptions, feel free to check out ratecompany.com anytime.\n\nAll the best,\nAlex',
          },
        ]
      },
      {
        id: 'cmp_demo_2',
        name: 'German Tech Founders & CTOs (DACH)',
        status: 'running',
        listId: 'lst_demo_1',
        steps: [
          {
            pos: 1,
            delay: 0,
            subject: 'Skalierung der Outbound-Pipeline bei {{company}} (100% DSGVO)',
            text: 'Hallo {{first_name}},\n\nich habe gesehen, dass {{company}} stark wächst. Viele Tech-Unternehmen im DACH-Raum suchen derzeit nach rechtssicheren Outbound-Lösungen mit EU-Hosting statt US-Clouds.\n\nSmartReach hostet 100% in Frankfurt und ermöglicht unbegrenzte Mailbox-Rotation ohne monatliche Lizenzkosten.\n\nHast du nächste Woche 15 Minuten Zeit für einen kurzen Austausch?\n\nViele Grüße,\nMarcus',
          },
          {
            pos: 2,
            delay: 3,
            subject: 'Re: Skalierung der Outbound-Pipeline bei {{company}}',
            text: 'Hallo {{first_name}},\n\nkurzes Nachhaken zu meiner Nachricht von Dienstag. Falls du dir das Tool vorab ansehen möchtest, schicke ich dir gerne direkt einen Gastzugang.\n\nPasst dir Donnerstag um 10 Uhr?\n\nBeste Grüße,\nMarcus',
          },
        ]
      },
      {
        id: 'cmp_demo_3',
        name: 'Series A/B Growth VP Marketing Outreach',
        status: 'completed',
        listId: 'lst_demo_2',
        steps: [
          {
            pos: 1,
            delay: 0,
            subject: 'Scaling outbound pipeline for {{company}}',
            text: 'Hi {{first_name}},\n\nCongrats on the recent growth milestones at {{company}}! Reaching out because scaling SDR outbound typically hits a wall when ESPs limit mailbox throughput.\n\nWould love to show you how our multi-inbox rotation keeps open rates above 65%.\n\nBest,\nSarah',
          },
        ]
      },
      {
        id: 'cmp_demo_4',
        name: 'E-Commerce Brands & DTC Founders Outreach',
        status: 'running',
        listId: 'lst_demo_3',
        steps: [
          {
            pos: 1,
            delay: 0,
            subject: 'B2B Wholesale & Retail Partnerships for {{company}}',
            text: 'Hey {{first_name}},\n\nLove what you are building with {{company}}. Are you currently exploring automated B2B retail outreach to expand wholesale distribution?\n\nLet me know if you would like to see how other DTC brands are booking 30+ buyer calls a month.\n\nCheers,\nAlex',
          },
        ]
      },
      {
        id: 'cmp_demo_5',
        name: 'B2B Outbound Agencies & Lead Gen Operators',
        status: 'running',
        listId: 'lst_demo_4',
        steps: [
          {
            pos: 1,
            delay: 0,
            subject: 'Zero per-client fees for your lead gen agency',
            text: 'Hi {{first_name}},\n\nIf your agency manages client outreach on Instantly or Smartlead, you know how quickly per-seat and per-workspace fees eat into margins.\n\nWith SmartReach, you get unlimited client-isolated workspaces and unlimited sender mailboxes 100% free.\n\nOpen to exploring a partnership?\n\nBest,\nAlex',
          },
        ]
      },
      {
        id: 'cmp_demo_6',
        name: 'Fintech & Insurtech Heads of Sales',
        status: 'completed',
        listId: 'lst_demo_5',
        steps: [
          {
            pos: 1,
            delay: 0,
            subject: 'Institutional deliverability & compliance for {{company}}',
            text: 'Hi {{first_name}},\n\nIn heavily regulated industries like Fintech, email deliverability and data sovereignty are paramount.\n\nWe provide strict Frankfurt EU hosting and ISO-grade security with unlimited mailboxes.\n\nWould you have 10 minutes this Friday for a quick intro?\n\nBest,\nSarah',
          },
        ]
      },
      {
        id: 'cmp_demo_7',
        name: 'Nordics & UK AI Infrastructure Leaders',
        status: 'running',
        listId: 'lst_demo_2',
        steps: [
          {
            pos: 1,
            delay: 0,
            subject: 'Outbound pipeline for {{company}} AI infrastructure',
            text: 'Hi {{first_name}},\n\nReaching out because AI infrastructure teams scaling enterprise adoption need continuous, reliable outbound touchpoints with engineering leaders.\n\nHappy to share our sequence playbook that achieved a 15% reply rate across enterprise CTOs.\n\nBest,\nAlex',
          },
        ]
      },
    ];

    const campaignLeadsMap = []; // Will store campaign lead IDs for email jobs

    for (const cmp of campaignsConfig) {
      await client.query(
        `INSERT INTO campaigns (
          id, user_id, workspace_id, name, status, daily_limit, lead_list_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 150, $6, $7, $7
        )`,
        [cmp.id, DEMO_USER_ID, DEMO_WORKSPACE_ID, cmp.name, cmp.status, cmp.listId, nowIso]
      );

      // Connect senders to campaign
      for (const s of sendersConfig) {
        await client.query(
          `INSERT INTO campaign_senders (campaign_id, sender_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [cmp.id, s.id, nowIso]
        );
      }

      // Add sequence steps
      for (const step of cmp.steps) {
        const stepId = `stp_${cmp.id}_${step.pos}`;
        await client.query(
          `INSERT INTO sequence_steps (id, campaign_id, position, delay_days, type, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [stepId, cmp.id, step.pos, step.delay, step.pos === 1 ? 'initial' : 'follow_up', nowIso]
        );

        await client.query(
          `INSERT INTO sequence_step_variants (
            id, step_id, label, subject, body_html, body_text, weight, created_at, updated_at
          ) VALUES (
            $1, $2, 'A', $3, $4, $5, 100, $6, $6
          )`,
          [
            `var_${stepId}_A`,
            stepId,
            step.subject,
            `<p>${step.text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
            step.text,
            nowIso,
          ]
        );
      }

      // Attach 800-1,200 campaign leads from this list
      const sourceLeads = (leadListMap[cmp.listId] || []).slice(0, 1000);
      const clValues = [];
      const clParams = [];

      for (let i = 0; i < sourceLeads.length; i++) {
        const ld = sourceLeads[i];
        const clId = `cl_${cmp.id}_${ld.id}`;
        const status = i < 140 ? 'replied' : i < 850 ? 'sent' : 'queued';

        campaignLeadsMap.push({
          id: clId,
          campaignId: cmp.id,
          leadId: ld.id,
          email: ld.email,
          fn: ld.fn,
          comp: ld.comp,
          status,
        });

        clParams.push(clId, cmp.id, ld.id, status, nowIso, nowIso);
        const base = i * 6;
        clValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
      }

      if (clValues.length > 0) {
        await client.query(
          `INSERT INTO campaign_leads (id, campaign_id, lead_id, status, created_at, updated_at)
           VALUES ${clValues.join(',')}
           ON CONFLICT DO NOTHING`,
          clParams
        );
      }
    }

    // 7. Generate Rich Timeseries Data (Past 60 Days + Future 90 Days)
    console.log('7. Generating continuous timeseries data (-60 to +90 days) for analytics graphs...');
    const totalDays = 150; // -60 to +90 days
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - 60);

    const emailJobsValues = [];
    const emailJobsParams = [];
    let totalJobsCount = 0;

    // Distribute jobs across campaign leads
    let clIdx = 0;
    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
      const day = new Date(baseDate);
      day.setDate(day.getDate() + dayOffset);
      const dayIso = day.toISOString().slice(0, 10);

      // 30 to 50 jobs per day
      const dailyJobs = randomInt(30, 50);

      for (let j = 0; j < dailyJobs; j++) {
        if (clIdx >= campaignLeadsMap.length) clIdx = 0;
        const cl = campaignLeadsMap[clIdx++];
        const sender = randomChoice(sendersConfig);

        const hour = randomInt(8, 18);
        const minute = randomInt(0, 59);
        const jobSentIso = `${dayIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

        const isBounced = Math.random() < 0.02;
        const status = isBounced ? 'bounced' : 'sent';
        const jobId = `ej_${dayIso}_${j}_${crypto.randomBytes(3).toString('hex')}`;

        emailJobsParams.push(
          jobId,
          cl.campaignId,
          cl.id,
          sender.id,
          cl.leadId,
          cl.email,
          `Scaling outreach at ${cl.comp}`,
          `Hi ${cl.fn}, let me know if Thursday 2pm works.`,
          `<p>Hi ${cl.fn}, let me know if Thursday 2pm works.</p>`,
          status,
          jobSentIso,
          jobSentIso,
          false,
          nowIso,
          nowIso
        );

        const b = emailJobsParams.length - 15;
        emailJobsValues.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14}, $${b + 15})`
        );
        totalJobsCount++;

        if (emailJobsValues.length >= 300) {
          const insertQuery = `
            INSERT INTO email_jobs (
              id, campaign_id, campaign_lead_id, sender_id, lead_id, to_email, subject,
              body_text, body_html, status, scheduled_for, sent_at, dry_run, created_at, updated_at
            ) VALUES ${emailJobsValues.join(',')}
            ON CONFLICT (campaign_lead_id, step_position) DO NOTHING
          `;
          await client.query(insertQuery, emailJobsParams);
          emailJobsValues.length = 0;
          emailJobsParams.length = 0;
        }
      }
    }

    if (emailJobsValues.length > 0) {
      const insertQuery = `
        INSERT INTO email_jobs (
          id, campaign_id, campaign_lead_id, sender_id, lead_id, to_email, subject,
          body_text, body_html, status, scheduled_for, sent_at, dry_run, created_at, updated_at
        ) VALUES ${emailJobsValues.join(',')}
        ON CONFLICT (campaign_lead_id, step_position) DO NOTHING
      `;
      await client.query(insertQuery, emailJobsParams);
    }
    console.log(`   Generated & inserted ${totalJobsCount} timeseries email jobs.`);

    // 8. Create UniBox Threaded Conversations
    console.log('8. Creating 18 UniBox threaded conversations (interested, meetings, not interested, OOO)...');

    const uniboxThreads = [
      {
        lead: { name: 'Sarah Jenkins', email: 'sarah.jenkins@cloudscale.io', company: 'CloudScale' },
        campaignId: 'cmp_demo_1',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'interested',
        subject: 'Scaling enterprise outbound at CloudScale',
        outbound: 'Hi Sarah, noticed CloudScale is expanding your SDR team. Most founders we talk to struggle with mailbox deliverability once they scale past 5 inboxes. We built SmartReach to give you unlimited mailboxes and automatic rotation with zero seat fees. Would you be open to a 10-minute demo this week?',
        reply: 'Hi Alex, actually this is very timely. Our deliverability on Google Workspace dropped last week. Would love to see a demo this Thursday around 2:00 PM CET. Can you send a calendar link?',
        operatorResponse: 'Hi Sarah, thrilled to connect! Here is my direct calendar link: https://cal.com/ratecompany/demo. Looking forward to speaking on Thursday at 2:00 PM CET!',
        followupReply: 'Booked for 2pm! Looking forward to it.',
        hoursAgo: 2
      },
      {
        lead: { name: 'Markus Weber', email: 'markus.weber@bytelogic.de', company: 'ByteLogic GmbH' },
        campaignId: 'cmp_demo_2',
        senderId: 'snd_demo_5',
        senderEmail: 'marcus.k@ratecompany.de',
        senderName: 'Marcus Koch',
        tag: 'meeting_booked',
        subject: 'Skalierung der Outbound-Pipeline bei ByteLogic (100% DSGVO)',
        outbound: 'Hallo Markus, ich habe gesehen, dass ByteLogic stark wächst. Viele Tech-Unternehmen im DACH-Raum suchen nach rechtssicheren Outbound-Lösungen mit EU-Hosting. SmartReach hostet 100% in Frankfurt und bietet unbegrenzte Mailbox-Rotation. Hast du nächste Woche 15 Minuten Zeit für einen kurzen Austausch?',
        reply: 'Hallo Marcus, klingt extrem spannend. Wir suchen gerade nach einer Alternative zu Lemlist mit sauberem EU-Hosting und Mailbox-Rotation. Kannst du mir vorab die Case Studies schicken?',
        operatorResponse: 'Hallo Markus, freut mich sehr! Habe dir unsere aktuelle Case Study direkt angehängt. Passt dir ein kurzer 15-Minuten Austausch morgen um 10:00 Uhr?',
        followupReply: 'Morgen 10:00 Uhr passt perfekt, trage ich mir ein. Bis morgen!',
        hoursAgo: 4
      },
      {
        lead: { name: 'Elena Rostova', email: 'elena.r@finflow.co', company: 'FinFlow' },
        campaignId: 'cmp_demo_6',
        senderId: 'snd_demo_2',
        senderEmail: 'sarah.m@ratecompany.com',
        senderName: 'Sarah Miller',
        tag: 'interested',
        subject: 'Institutional deliverability & compliance for FinFlow',
        outbound: 'Hi Elena, in heavily regulated industries like Fintech, email deliverability and data sovereignty are paramount. We provide strict Frankfurt EU hosting and ISO-grade security with unlimited mailboxes. Would you have 10 minutes this Friday for a quick intro?',
        reply: 'Hey Sarah, this sounds great. Can we connect 50 custom domains without paying per-seat fees? We currently have 8 SDRs.',
        operatorResponse: 'Hey Elena! Exactly — zero per-seat fees and unlimited mailbox rotation across all 50 domains. All 8 SDRs can collaborate in the same workspace without extra licenses.',
        followupReply: 'Incredible. Let us get our RevOps team on a walkthrough this Friday morning.',
        hoursAgo: 7
      },
      {
        lead: { name: 'David Zhao', email: 'david.zhao@apexdata.ai', company: 'ApexData' },
        campaignId: 'cmp_demo_7',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'meeting_booked',
        subject: 'Outbound pipeline for ApexData AI infrastructure',
        outbound: 'Hi David, reaching out because AI infrastructure teams scaling enterprise adoption need continuous, reliable outbound touchpoints. Happy to share our sequence playbook that achieved a 15% reply rate across enterprise CTOs.',
        reply: 'Count us in. What does the onboarding process look like? Can we import our CSV list directly?',
        operatorResponse: 'Takes less than 5 minutes! You can connect mailboxes via standard SMTP/IMAP and import your CSV with automated column mapping.',
        followupReply: 'Awesome, see you on Wednesday at 11am.',
        hoursAgo: 11
      },
      {
        lead: { name: 'Sophie Becker', email: 's.becker@datasphere.de', company: 'DataSphere AG' },
        campaignId: 'cmp_demo_2',
        senderId: 'snd_demo_5',
        senderEmail: 'marcus.k@ratecompany.de',
        senderName: 'Marcus Koch',
        tag: 'interested',
        subject: 'Skalierung der Outbound-Pipeline bei DataSphere AG',
        outbound: 'Hallo Sophie, SmartReach ermöglicht unbegrenzte Mailbox-Rotation und 100% DSGVO-Konformität in Frankfurt. Dürfen wir dir eine kurze Demo zeigen?',
        reply: 'Hallo Marcus, wie hoch sind die Kosten für Managed Mailboxes und Deliverability Setup? Wir suchen nach einer Komplettlösung.',
        operatorResponse: 'Hallo Sophie, die SmartReach Software ist 100% kostenfrei inklusive unbegrenzter Mailboxen! Für voll betreute Mailboxen haben wir modulare Partnerpakete ab 15€/Monat.',
        followupReply: 'Das klingt fair. Schick mir gerne den Registrierungslink.',
        hoursAgo: 16
      },
      {
        lead: { name: 'Julian Koch', email: 'j.koch@optima.ch', company: 'Optima Digital' },
        campaignId: 'cmp_demo_1',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'meeting_booked',
        subject: 'Cold outreach response rates at Optima Digital',
        outbound: 'Hi Julian, noticed Optima is expanding your international sales footprint. Would love to share how our mailbox rotation keeps bounce rates below 1.5%.',
        reply: 'Thanks for reaching out Alex. Let us schedule a call next Tuesday at 3:00 PM CET.',
        operatorResponse: 'Tuesday at 3:00 PM CET confirmed! Invite sent to your calendar. Looking forward to speaking!',
        followupReply: 'Confirmed on our end. Thanks!',
        hoursAgo: 22
      },
      {
        lead: { name: 'Anna Schulz', email: 'anna.s@zenithmedia.com', company: 'Zenith Media' },
        campaignId: 'cmp_demo_5',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'interested',
        subject: 'Zero per-client fees for your lead gen agency',
        outbound: 'Hi Anna, with SmartReach your agency gets unlimited client-isolated workspaces and unlimited sender mailboxes 100% free.',
        reply: 'Love the approach. Does SmartReach support automated stop-on-reply across all sequence steps?',
        operatorResponse: 'Yes Anna! Stop-on-reply is instant and automatic. As soon as a lead responds, their sequence freezes and their thread appears in your UniBox.',
        followupReply: null,
        hoursAgo: 26
      },
      {
        lead: { name: 'Thomas Meyer', email: 't.meyer@stratoscloud.com', company: 'Stratos Cloud' },
        campaignId: 'cmp_demo_1',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'meeting_booked',
        subject: 'Enterprise deliverability benchmark for Stratos Cloud',
        outbound: 'Hi Thomas, quick benchmark on deliverability: rotating 20 inboxes delivers 4x higher inbox placement than blast-sending from 2 domains.',
        reply: 'Send over an invite for Monday morning at 10am CET, let us discuss.',
        operatorResponse: 'Sent! Looking forward to talking Monday at 10am CET.',
        followupReply: null,
        hoursAgo: 30
      },
      {
        lead: { name: 'Michael Brown', email: 'm.brown@nexacorp.com', company: 'NexaCorp' },
        campaignId: 'cmp_demo_1',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'not_interested',
        subject: 'Quick question regarding NexaCorp outbound pipeline',
        outbound: 'Hi Michael, would you be open to a 10-minute demo showing how mailbox rotation increases enterprise reply rates?',
        reply: 'Thanks for reaching out, but we just signed an annual contract with another vendor last month. Please remove us from your sequence.',
        operatorResponse: 'Understood Michael! Removed immediately from all future follow-ups. Best of luck with the new platform!',
        followupReply: null,
        hoursAgo: 34
      },
      {
        lead: { name: 'Lisa Schmidt', email: 'lisa.s@alphaventures.vc', company: 'AlphaVentures' },
        campaignId: 'cmp_demo_3',
        senderId: 'snd_demo_2',
        senderEmail: 'sarah.m@ratecompany.com',
        senderName: 'Sarah Miller',
        tag: 'not_interested',
        subject: 'Scaling outbound pipeline for AlphaVentures',
        outbound: 'Hi Lisa, congrats on your recent portfolio announcements. Are your founders looking for scalable outbound infrastructure?',
        reply: 'Not a priority for Q4, but feel free to check back in Q1 next year when our budget refreshes.',
        operatorResponse: 'Thanks for letting me know Lisa, will set a reminder to circle back in January! Have a great Q4.',
        followupReply: null,
        hoursAgo: 40
      },
      {
        lead: { name: 'Robert Klein', email: 'r.klein@omnisoft.de', company: 'OmniSoft Solutions' },
        campaignId: 'cmp_demo_2',
        senderId: 'snd_demo_5',
        senderEmail: 'marcus.k@ratecompany.de',
        senderName: 'Marcus Koch',
        tag: 'not_interested',
        subject: 'Skalierung der Outbound-Pipeline bei OmniSoft Solutions',
        outbound: 'Hallo Robert, SmartReach hostet 100% in Frankfurt und ermöglicht unbegrenzte Mailbox-Rotation ohne Lizenzkosten.',
        reply: 'Wir bauen unsere internen Tools selbst und haben keinen Bedarf. Danke.',
        operatorResponse: null,
        followupReply: null,
        hoursAgo: 48
      },
      {
        lead: { name: 'Clara Vance', email: 'clara@vectorlabs.io', company: 'Vector Labs' },
        campaignId: 'cmp_demo_7',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'not_interested',
        subject: 'Outbound pipeline for Vector Labs AI infrastructure',
        outbound: 'Hi Clara, happy to share our sequence playbook that achieved a 15% reply rate across enterprise CTOs.',
        reply: 'Please take me off your list. Thank you.',
        operatorResponse: 'Done Clara, your email has been permanently added to our suppression blocklist.',
        followupReply: null,
        hoursAgo: 52
      },
      {
        lead: { name: 'Daniel Wagner', email: 'd.wagner@bluepeak.com', company: 'BluePeak Group' },
        campaignId: 'cmp_demo_1',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'not_interested',
        subject: 'Quick question regarding BluePeak Group outbound pipeline',
        outbound: 'Hi Daniel, would you be open to a 10-minute demo on mailbox rotation?',
        reply: 'We do not do outbound email right now, only inbound events and referrals. Best of luck.',
        operatorResponse: null,
        followupReply: null,
        hoursAgo: 60
      },
      {
        lead: { name: 'Hannah Richter', email: 'h.richter@metapoint.net', company: 'MetaPoint' },
        campaignId: 'cmp_demo_5',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'not_interested',
        subject: 'Zero per-client fees for your lead gen agency',
        outbound: 'Hi Hannah, with SmartReach your agency gets unlimited client-isolated workspaces 100% free.',
        reply: 'No need currently, thanks.',
        operatorResponse: null,
        followupReply: null,
        hoursAgo: 65
      },
      {
        lead: { name: 'Johannes Müller', email: 'j.mueller@greentech.de', company: 'GreenTech Innovations' },
        campaignId: 'cmp_demo_2',
        senderId: 'snd_demo_5',
        senderEmail: 'marcus.k@ratecompany.de',
        senderName: 'Marcus Koch',
        tag: 'out_of_office',
        subject: 'Re: Skalierung der Outbound-Pipeline bei GreenTech Innovations',
        outbound: 'Hallo Johannes, SmartReach hostet 100% in Frankfurt und ermöglicht unbegrenzte Mailbox-Rotation.',
        reply: 'Auto-reply: Ich bin derzeit im Jahresurlaub und bis einschließlich nächsten Montag nur eingeschränkt erreichbar. In dringenden Fällen wenden Sie sich bitte an info@greentech.de.',
        operatorResponse: null,
        followupReply: null,
        hoursAgo: 70
      },
      {
        lead: { name: 'Laura Fischer', email: 'l.fischer@novacorp.eu', company: 'NovaCorp Labs' },
        campaignId: 'cmp_demo_6',
        senderId: 'snd_demo_2',
        senderEmail: 'sarah.m@ratecompany.com',
        senderName: 'Sarah Miller',
        tag: 'out_of_office',
        subject: 'Re: Institutional deliverability & compliance for NovaCorp Labs',
        outbound: 'Hi Laura, would you have 10 minutes this Friday for a quick intro on compliant EU outbound?',
        reply: 'Out of Office: Thank you for your email. I am currently attending SaaStr Europe and will return on Monday with limited inbox access.',
        operatorResponse: null,
        followupReply: null,
        hoursAgo: 75
      },
      {
        lead: { name: 'Felix Weber', email: 'f.weber@cloudbase.systems', company: 'CloudBase Systems' },
        campaignId: 'cmp_demo_1',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'interested',
        subject: 'Quick question regarding CloudBase Systems outbound pipeline',
        outbound: 'Hi Felix, would you be open to a 10-minute demo on mailbox rotation?',
        reply: 'Quick question: does SmartReach integrate with HubSpot CRM or webhook triggers?',
        operatorResponse: 'Hey Felix! Yes, you can export all replied leads and webhook events directly into HubSpot or any CRM via webhooks.',
        followupReply: 'Great, let us set up a demo call for next week.',
        hoursAgo: 82
      },
      {
        lead: { name: 'Christina Wolf', email: 'c.wolf@synthetix.ai', company: 'Synthetix AI' },
        campaignId: 'cmp_demo_7',
        senderId: 'snd_demo_1',
        senderEmail: 'alex.v@ratecompany.com',
        senderName: 'Alex Vance',
        tag: 'interested',
        subject: 'Outbound pipeline for Synthetix AI infrastructure',
        outbound: 'Hi Christina, happy to share our sequence playbook that achieved a 15% reply rate across enterprise CTOs.',
        reply: 'Looks promising! How does your warmup algorithm compare to Instantly and Lemlist?',
        operatorResponse: 'Hey Christina! Our warmup ramps sending gradually with human-like delays and natural conversation threads to maximize inbox placement without triggering spam filters.',
        followupReply: null,
        hoursAgo: 90
      },
    ];

    for (let i = 0; i < uniboxThreads.length; i++) {
      const th = uniboxThreads[i];
      const leadId = `lead_unibox_${i + 1}`;
      const replyId = `rep_demo_${i + 1}`;
      const msgTime = new Date(Date.now() - th.hoursAgo * 3600 * 1000);
      const msgIso = msgTime.toISOString();
      const outboundIso = new Date(msgTime.getTime() - 24 * 3600 * 1000).toISOString();

      // Ensure Lead exists
      const names = th.lead.name.split(' ');
      await client.query(
        `INSERT INTO leads (
          id, user_id, workspace_id, list_id, email, first_name, last_name, company,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'lst_demo_1', $4, $5, $6, $7, $8, $9, $9
        ) ON CONFLICT (id) DO UPDATE SET status = $8`,
        [
          leadId,
          DEMO_USER_ID,
          DEMO_WORKSPACE_ID,
          th.lead.email,
          names[0],
          names[1] || '',
          th.lead.company,
          th.tag === 'not_interested' ? 'contacted' : 'replied',
          outboundIso,
        ]
      );

      // Create Campaign Lead
      const clId = `cl_${th.campaignId}_${leadId}`;
      await client.query(
        `INSERT INTO campaign_leads (id, campaign_id, lead_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT DO NOTHING`,
        [clId, th.campaignId, leadId, th.tag === 'not_interested' ? 'sent' : 'replied', outboundIso]
      );

      // Create outbound Email Job for thread history
      const jobId = `ej_unibox_${i + 1}`;
      await client.query(
        `INSERT INTO email_jobs (
          id, campaign_id, campaign_lead_id, sender_id, lead_id, to_email, subject,
          body_text, body_html, status, scheduled_for, sent_at, dry_run, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'sent', $10, $10, false, $10, $10
        ) ON CONFLICT (id) DO NOTHING`,
        [
          jobId,
          th.campaignId,
          clId,
          th.senderId,
          leadId,
          th.lead.email,
          th.subject,
          th.outbound,
          `<p>${th.outbound}</p>`,
          outboundIso,
        ]
      );

      // Create Inbound Reply
      await client.query(
        `INSERT INTO replies (
          id, user_id, sender_id, lead_id, campaign_id, from_name, from_email,
          subject, snippet, body_text, body_html, received_at, read_at, tag, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $12
        ) ON CONFLICT (id) DO UPDATE SET tag = $13`,
        [
          replyId,
          DEMO_USER_ID,
          th.senderId,
          leadId,
          th.campaignId,
          th.lead.name,
          th.lead.email,
          `Re: ${th.subject}`,
          th.reply.slice(0, 120),
          th.reply,
          `<p>${th.reply}</p>`,
          msgIso,
          th.tag,
        ]
      );

      // If operator responded, create UniboxMessage
      if (th.operatorResponse) {
        const opTime = new Date(msgTime.getTime() + 15 * 60 * 1000).toISOString();
        await client.query(
          `INSERT INTO unibox_messages (
            id, user_id, workspace_id, reply_id, lead_id, campaign_id, sender_id,
            direction, from_role, from_name, from_email, subject, body_text, body_html, sent_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, 'operator', 'operator', $8, $9, $10, $11, $12, $13, $13
          )`,
          [
            `msg_op_${i + 1}`,
            DEMO_USER_ID,
            DEMO_WORKSPACE_ID,
            replyId,
            leadId,
            th.campaignId,
            th.senderId,
            th.senderName,
            th.senderEmail,
            `Re: ${th.subject}`,
            th.operatorResponse,
            `<p>${th.operatorResponse}</p>`,
            opTime,
          ]
        );
      }

      // If lead responded again after operator
      if (th.followupReply) {
        const followTime = new Date(msgTime.getTime() + 45 * 60 * 1000).toISOString();
        await client.query(
          `INSERT INTO unibox_messages (
            id, user_id, workspace_id, reply_id, lead_id, campaign_id, sender_id,
            direction, from_role, from_name, from_email, subject, body_text, body_html, sent_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, 'inbound', 'lead', $8, $9, $10, $11, $12, $13, $13
          )`,
          [
            `msg_in_${i + 1}`,
            DEMO_USER_ID,
            DEMO_WORKSPACE_ID,
            replyId,
            leadId,
            th.campaignId,
            th.senderId,
            th.lead.name,
            th.lead.email,
            `Re: ${th.subject}`,
            th.followupReply,
            `<p>${th.followupReply}</p>`,
            followTime,
          ]
        );
      }
    }

    // 9. Create Email Templates in /templates
    console.log('9. Creating 5 Email Templates...');
    const templates = [
      {
        id: 'tpl_demo_1',
        name: 'SaaS Founder-to-Founder Intro',
        subject: 'Quick question for {{company}} founder',
        bodyText: 'Hi {{first_name}},\n\nLoved your recent updates with {{company}}. Reaching out founder-to-founder because scaling cold outbound is usually painful with mailbox limits.\n\nWe built SmartReach to eliminate per-seat fees and give you unlimited inboxes with automatic rotation.\n\nOpen to a quick 10-minute chat this Thursday?\n\nBest,\nAlex',
      },
      {
        id: 'tpl_demo_2',
        name: 'Deliverability & Multi-Mailbox Pitch',
        subject: 'How {{company}} can achieve 65%+ inbox placement',
        bodyText: 'Hey {{first_name}},\n\nSending more than 30-40 emails per day from a single Google or Microsoft account ruins domain reputation.\n\nOur system distributes outreach across 20+ sender domains with intelligent human pacing. Would you like to see our deliverability benchmarks?\n\nBest,\nSarah',
      },
      {
        id: 'tpl_demo_3',
        name: 'Quick Bump / Gentle Follow-Up',
        subject: 'Re: Quick question for {{company}}',
        bodyText: 'Hi {{first_name}},\n\nJust bumping this to the top of your inbox. Did you get a chance to review my previous note?\n\nHappy to send over a 2-minute Loom walkthrough if that is easier.\n\nCheers,\nAlex',
      },
      {
        id: 'tpl_demo_4',
        name: 'Value Case Study & 3x Reply Rate',
        subject: 'Case study: How CloudScale generated 140+ meetings in 30 days',
        bodyText: 'Hi {{first_name}},\n\nQuick story: CloudScale switched from single-domain sending to SmartReach 20-mailbox rotation, increasing their qualified reply rate from 3.2% to 12.8%.\n\nLet me know if you would like me to forward the breakdown slides.\n\nBest,\nAlex',
      },
      {
        id: 'tpl_demo_5',
        name: 'German Tech B2B Cold Outreach (DACH)',
        subject: 'DSGVO-konforme Outbound-Infrastruktur für {{company}}',
        bodyText: 'Hallo {{first_name}},\n\nSmartReach bietet unbegrenzte Mailbox-Rotation und 100% Rechenzentrum-Hosting in Frankfurt am Main ohne Lizenzgebühren.\n\nPasst Ihnen nächste Woche ein kurzes 15-minütiges Gespräch?\n\nBeste Grüße,\nMarcus',
      },
    ];

    for (const t of templates) {
      await client.query(
        `INSERT INTO email_templates (
          id, user_id, name, subject, body_html, body_text, format, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'html', $7, $7
        )`,
        [
          t.id,
          DEMO_USER_ID,
          t.name,
          t.subject,
          `<p>${t.bodyText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
          t.bodyText,
          nowIso,
        ]
      );
    }

    // 10. Create 30 Activity Logs for Dashboard Feed
    console.log('10. Creating 30 Activity Logs for live dashboard feed...');
    const activityTypes = [
      { type: 'reply_received', msg: 'Sarah Jenkins (VP Sales at CloudScale) replied: "Would love to see a demo this Thursday around 2:00 PM CET"' },
      { type: 'meeting_booked', msg: 'Meeting scheduled with Markus Weber (ByteLogic GmbH) for Thursday 10:00 AM' },
      { type: 'reply_received', msg: 'Elena Rostova (FinFlow) replied: "Can we connect 50 custom domains without paying per-seat fees?"' },
      { type: 'campaign_started', msg: 'Campaign "Q4 Enterprise SaaS Decision Makers" dispatched 420 emails across 6 mailboxes' },
      { type: 'lead_imported', msg: 'Imported 1,850 leads into "DACH Tech Founders & C-Levels"' },
      { type: 'sender_connected', msg: 'Mailbox alex.v@ratecompany.com completed automated warmup (Health: 99%)' },
      { type: 'sender_connected', msg: 'Mailbox sarah.m@ratecompany.com completed automated warmup (Health: 98%)' },
      { type: 'meeting_booked', msg: 'Meeting scheduled with David Zhao (ApexData) for Wednesday 11:00 AM' },
      { type: 'reply_received', msg: 'Julian Koch (Optima Digital) replied: "Let us schedule a call next Tuesday at 3:00 PM CET"' },
      { type: 'campaign_completed', msg: 'Campaign "Series A/B Growth VP Marketing Outreach" completed with 162 replies (13.0% reply rate)' },
      { type: 'lead_imported', msg: 'Imported 1,650 leads into "US SaaS VPs of Sales & RevOps"' },
      { type: 'reply_received', msg: 'Anna Schulz (Zenith Media) replied: "Does SmartReach support automated stop-on-reply?"' },
      { type: 'sender_connected', msg: 'Mailbox marcus.k@ratecompany.de active on European IP cluster' },
      { type: 'campaign_started', msg: 'Campaign "German Tech Founders & CTOs (DACH)" started with 1,850 prospect contacts' },
    ];

    for (let i = 0; i < 30; i++) {
      const act = activityTypes[i % activityTypes.length];
      const actTime = new Date(Date.now() - (i * 2.5 + 1) * 3600 * 1000).toISOString();
      await client.query(
        `INSERT INTO activity_logs (id, user_id, type, message, campaign_id, meta, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          DEMO_USER_ID,
          act.type,
          act.msg,
          'cmp_demo_1',
          JSON.stringify({ workspaceId: DEMO_WORKSPACE_ID }),
          actTime,
        ]
      );
    }

    // 11. Add Suppressions (blocklist)
    console.log('11. Adding Suppressions (blocklist)...');
    const suppressionsList = [
      { val: 'competitor.com', kind: 'domain', reason: 'Competitor domain block' },
      { val: 'internal-test@ratecompany.com', kind: 'email', reason: 'Internal testing email' },
      { val: 'm.brown@nexacorp.com', kind: 'email', reason: 'Opted out via UniBox' },
      { val: 'clara@vectorlabs.io', kind: 'email', reason: 'Unsubscribed on request' },
    ];

    for (const sup of suppressionsList) {
      await client.query(
        `INSERT INTO suppressions (id, user_id, workspace_id, value, kind, reason, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)
         ON CONFLICT (user_id, value) DO NOTHING`,
        [crypto.randomUUID(), DEMO_USER_ID, DEMO_WORKSPACE_ID, sup.val, sup.kind, sup.reason, nowIso]
      );
    }

    await client.query('COMMIT');
    console.log('\n======================================================');
    console.log('✨ SmartReach Demo Account Successfully Seeded! ✨');
    console.log(`Email:    ${DEMO_EMAIL}`);
    console.log(`Password: ${DEMO_PASSWORD}`);
    console.log('======================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR SEEDING DEMO ACCOUNT:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
