const { Pool } = require('pg');
const { hashPassword } = require('better-auth/crypto');
const crypto = require('crypto');

const ADMIN_EMAIL = 'de.krish.shah@gmail.com';
const ADMIN_PASSWORD = 'demo123';
const ADMIN_USER_ID = 'usr_admin_krish';
const ADMIN_WORKSPACE_ID = 'ws_admin_krish';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://smartreach_user:17e808d5ab8c28f4875c2c4d8f6ee0c562592646ccb73e0c@127.0.0.1:5432/smartreach';

const pool = new Pool({ connectionString: DATABASE_URL });

async function seedAdmin() {
  const client = await pool.connect();
  try {
    console.log(`Checking if admin user ${ADMIN_EMAIL} exists...`);
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);

    if (existing.rows.length === 0) {
      console.log(`Creating admin account for ${ADMIN_EMAIL}...`);
      const passwordHash = await hashPassword(ADMIN_PASSWORD);
      const nowIso = new Date().toISOString();

      await client.query(
        `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [ADMIN_USER_ID, 'Krish Shah', ADMIN_EMAIL, true]
      );

      await client.query(
        `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [crypto.randomUUID(), ADMIN_USER_ID, 'credential', ADMIN_USER_ID, passwordHash]
      );

      await client.query(
        `INSERT INTO workspaces (id, user_id, name, description, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          ADMIN_WORKSPACE_ID,
          ADMIN_USER_ID,
          'RateCompany Admin',
          'Primary workspace for Krish Shah',
          true,
          nowIso,
          nowIso,
        ]
      );

      await client.query(
        `INSERT INTO workspace_settings (user_id, workspace_id, company_name, postal_address, unsubscribe_base_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          ADMIN_USER_ID,
          ADMIN_WORKSPACE_ID,
          'RateCompany Technologies GmbH',
          'Torstraße 140, 10119 Berlin, Germany',
          'https://130-61-146-177.sslip.io/unsubscribe',
          nowIso,
          nowIso,
        ]
      );

      console.log(`Admin user created successfully! (${ADMIN_EMAIL} / ${ADMIN_PASSWORD})`);
    } else {
      const uId = existing.rows[0].id;
      console.log(`Admin user ${ADMIN_EMAIL} exists with ID: ${uId}. Ensuring credential password...`);
      const passwordHash = await hashPassword(ADMIN_PASSWORD);
      const acc = await client.query('SELECT id FROM accounts WHERE user_id = $1 AND provider_id = $2', [uId, 'credential']);
      if (acc.rows.length === 0) {
        await client.query(
          `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [crypto.randomUUID(), uId, 'credential', uId, passwordHash]
        );
        console.log(`Admin account for ${ADMIN_EMAIL} already exists with a password configured. Leaving password unchanged.`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdmin().catch(console.error);
