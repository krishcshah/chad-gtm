const { Pool } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://smartreach_user:17e808d5ab8c28f4875c2c4d8f6ee0c562592646ccb73e0c@127.0.0.1:5432/smartreach';

const pool = new Pool({ connectionString: DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    const sampleReports = [
      {
        id: 'bug_demo_1',
        userId: 'usr_demo_ratecompany',
        userEmail: 'sarah.miller@acme-growth.io',
        userName: 'Sarah Miller',
        heading: 'CSV lead import showing 0 valid leads on Mac Safari',
        description: 'When uploading a 500-row CSV file exported from LinkedIn Sales Navigator, Safari hangs on step 2 mapping and reports 0 valid leads. Works fine on Chrome.',
        url: 'https://130-61-146-177.sslip.io/leads/import',
        status: 'investigating',
        createdHoursAgo: 48,
      },
      {
        id: 'bug_demo_2',
        userId: 'usr_demo_ratecompany',
        userEmail: 'marcus@techventure.de',
        userName: 'Marcus Koch',
        heading: 'Warmup ramp-up velocity setting',
        description: 'My custom SMTP inbox is on day 4 of warmup and has sent 15 emails today. Is there a way to increase the ramp-up velocity from 5 to 10 per day?',
        url: 'https://130-61-146-177.sslip.io/senders',
        status: 'resolved',
        createdHoursAgo: 96,
      },
      {
        id: 'bug_demo_3',
        userId: 'usr_demo_ratecompany',
        userEmail: 'elena@apexscale.com',
        userName: 'Elena Rostova',
        heading: 'Spintax preview not shuffling on click',
        description: 'In campaign sequence editor step 1, clicking the random preview button retains the first variation instead of cycling through all variations.',
        url: 'https://130-61-146-177.sslip.io/campaigns/cmp_demo_1',
        status: 'open',
        createdHoursAgo: 6,
      },
      {
        id: 'bug_demo_4',
        userId: 'usr_demo_ratecompany',
        userEmail: 'alex.founder@saasgrowth.co',
        userName: 'Alex Vance',
        heading: 'UniBox message thread tag update latency',
        description: 'When tagging an inbound prospect response as "Meeting Booked", it took about 5 seconds before the tag badge turned green on the thread list.',
        url: 'https://130-61-146-177.sslip.io/unibox',
        status: 'open',
        createdHoursAgo: 2,
      },
    ];

    for (const r of sampleReports) {
      const timeIso = new Date(Date.now() - r.createdHoursAgo * 3600 * 1000).toISOString();
      await client.query(
        `INSERT INTO bug_reports (id, user_id, user_email, user_name, heading, description, url, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.userId, r.userEmail, r.userName, r.heading, r.description, r.url, r.status, timeIso]
      );
    }

    console.log('Sample bug reports seeded successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
