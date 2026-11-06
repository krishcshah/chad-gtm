/**
 * Seed the platform admin account.
 *
 *   DATABASE_URL=... SEED_ADMIN_PASSWORD=... node scripts/seed-admin-account.cjs
 *
 * Optional: SEED_ADMIN_EMAIL (default de.krish.shah@gmail.com).
 * Refuses to run without a DATABASE_URL and a SEED_ADMIN_PASSWORD of at least
 * 12 characters. The password is never printed and never stored in the repo.
 * An existing account's password is never changed.
 */
const { Pool } = require('pg');
const { hashPassword } = require('better-auth/crypto');
const crypto = require('crypto');

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'de.krish.shah@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '';
const ADMIN_USER_ID = 'usr_admin_krish';
const ADMIN_WORKSPACE_ID = 'ws_admin_krish';

/* Set DATABASE_URL in the environment; credentials never live in the repo. */
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();

if (!DATABASE_URL) {
  console.error('Refusing to run: set DATABASE_URL.');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 12) {
  console.error('Refusing to run: set SEED_ADMIN_PASSWORD (at least 12 characters).');
  process.exit(1);
}

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

      await client.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [ADMIN_USER_ID]);
      try {
        await client.query(`UPDATE users SET approved_at = COALESCE(approved_at, NOW()) WHERE id = $1`, [ADMIN_USER_ID]);
      } catch (err) {
        console.warn(`Could not set approved_at (run npm run db:migrate first): ${err.message}`);
      }

      console.log(`Admin user ${ADMIN_EMAIL} created with role admin. Password: the SEED_ADMIN_PASSWORD you supplied.`);
    } else {
      const uId = existing.rows[0].id;
      console.log(`Admin user ${ADMIN_EMAIL} exists with ID: ${uId}. Checking credential account...`);
      const acc = await client.query('SELECT id FROM accounts WHERE user_id = $1 AND provider_id = $2', [uId, 'credential']);
      if (acc.rows.length === 0) {
        const passwordHash = await hashPassword(ADMIN_PASSWORD);
        await client.query(
          `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [crypto.randomUUID(), uId, 'credential', uId, passwordHash]
        );
        console.log(`Added a password login for ${ADMIN_EMAIL} (SEED_ADMIN_PASSWORD).`);
      } else {
        console.log(`${ADMIN_EMAIL} already has a password login. Leaving it unchanged.`);
      }
      console.log('Role and approval of an existing account are not changed by this script.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
