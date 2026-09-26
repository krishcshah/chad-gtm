const fs = require('fs');
const { Client } = require('pg');

// Read DATABASE_URL from .env.prod.local
const envContent = fs.readFileSync('.env.prod.local', 'utf8');
const match = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
if (!match) {
  console.error("DATABASE_URL not found in .env.prod.local");
  process.exit(1);
}

const connectionString = match[1];
console.log("Connecting to PostgreSQL...");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("Connected to PostgreSQL successfully!");

  const statements = [
    `ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_generate_on_the_fly" boolean DEFAULT false NOT NULL`,
    `ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_prompt" text DEFAULT '' NOT NULL`,
    `ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_api_key_enc" text`,
    `ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_provider" text DEFAULT 'google' NOT NULL`,
    `ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_model" text DEFAULT 'gemini-3.8-flash' NOT NULL`,
    `UPDATE "workspace_settings" SET "ai_model" = 'gemini-3.8-flash' WHERE "ai_model" IN ('gemini-2.5-flash', 'gemini-1.5-pro', 'gpt-4o', 'gpt-4o-mini')`
  ];

  for (const sql of statements) {
    console.log("Executing:", sql.slice(0, 60) + "...");
    await client.query(sql);
  }

  console.log("Migration executed successfully!");

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'workspace_settings';
  `);
  console.log("Current workspace_settings columns:", res.rows.map(r => r.column_name));

  await client.end();
}

run().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
