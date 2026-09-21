/**
 * Forge campaign/mail E2E seed + verify against running live engine.
 * Never prints passwords. Masks emails in evidence.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const EVID = path.resolve("_forge_evidence/wave_campaign_mail");
fs.mkdirSync(EVID, { recursive: true });

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function mask(email) {
  const [u, d] = String(email).split("@");
  return `${(u || "?").slice(0, 2)}…@${d || "?"}`;
}

const webEnv = loadEnv("apps/web/.env.local");
const mailEnv = loadEnv(process.env.MAIL_ENV_FILE || "/home/box/.config/smart-reach/mail.env");
process.env.ENCRYPTION_KEY = webEnv.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
process.env.BETTER_AUTH_SECRET = webEnv.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
const DATABASE_URL = webEnv.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/smartreach";

function getKey() {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (raw.length > 0) return createHash("sha256").update(raw).digest();
  throw new Error("ENCRYPTION_KEY missing");
}
function encryptSecret(plaintext) {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

const accounts = [];
for (let i = 1; i <= 40; i++) {
  const k = `MAIL_ACCOUNT_${String(i).padStart(2, "0")}`;
  if (mailEnv[k]) accounts.push({ key: k, email: mailEnv[k].trim() });
}
if (accounts.length < 3) throw new Error(`need >=3 mail accounts, got ${accounts.length}`);
const password = mailEnv.MAIL_PASSWORD;
const smtpHost = mailEnv.MAIL_SMTP_HOST;
const smtpPort = Number(mailEnv.MAIL_SMTP_PORT || 465);
const imapHost = mailEnv.MAIL_IMAP_HOST;
const imapPort = Number(mailEnv.MAIL_IMAP_PORT || 993);

// Use first 2 as senders, third as lead recipient
const senderA = accounts[0];
const senderB = accounts[1];
const leadTo = accounts[2];

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function statsQuery(client, campaignId) {
  return client.query(
    `SELECT
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id=$1 AND status IN ('sent','replied')) AS sent,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id=$1 AND status='replied') AS replied,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id=$1 AND status='failed') AS failed,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id=$1 AND status='queued') AS queued,
       (SELECT count(*)::int FROM email_jobs WHERE campaign_id=$1 AND status='sent') AS jobs_sent,
       (SELECT count(*)::int FROM email_jobs WHERE campaign_id=$1 AND status='failed') AS jobs_failed,
       (SELECT count(*)::int FROM email_jobs WHERE campaign_id=$1 AND status='pending') AS jobs_pending,
       (SELECT count(*)::int FROM replies WHERE campaign_id=$1) AS replies`,
    [campaignId],
  );
}

async function main() {
  const report = {
    at: now(),
    branch: "forge/campaign-mail-e2e",
    accountsAvailable: accounts.length,
    senders: [mask(senderA.email), mask(senderB.email)],
    lead: mask(leadTo.email),
    steps: {},
    blockers: [],
  };

  const client = await pool.connect();
  const userId = id();
  const listId = id();
  const leadId = id();
  const s1 = id();
  const s2 = id();
  const tplId = id();
  const campaignId = id();
  const clId = id();
  const enc = encryptSecret(password);

  try {
    // stats before (global)
    const beforeGlobal = await client.query(
      `SELECT
         (SELECT count(*)::int FROM email_jobs WHERE status='sent') AS jobs_sent,
         (SELECT count(*)::int FROM sender_accounts WHERE deleted_at IS NULL AND smtp_host <> 'localhost') AS real_senders,
         (SELECT count(*)::int FROM campaigns WHERE status='running') AS running`,
    );
    fs.writeFileSync(path.join(EVID, "stats_before.json"), JSON.stringify({ at: now(), ...beforeGlobal.rows[0] }, null, 2));

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Forge Campaign Mail', $2, true, now(), now())`,
      [userId, `forge-campaign-mail-${Date.now()}@example.com`],
    );
    await client.query(
      `INSERT INTO workspace_settings (user_id, company_name, postal_address, unsubscribe_base_url)
       VALUES ($1, 'Forge Mail Co', $2, 'http://127.0.0.1:3000')`,
      [userId, "123 Forge Strasse\nBerlin 10115\nGermany"],
    );

    for (const [sid, acc, name] of [
      [s1, senderA, "Forge Sender A"],
      [s2, senderB, "Forge Sender B"],
    ]) {
      await client.query(
        `INSERT INTO sender_accounts (
           id, user_id, sender_name, email, smtp_host, smtp_port, smtp_username,
           smtp_password_enc, smtp_security, imap_host, imap_port, imap_username,
           imap_password_enc, daily_limit, hourly_limit, from_name, status, health,
           smtp_status, imap_status, timezone
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$4,$7,'ssl',$8,$9,$4,$7,50,20,$3,'active',100,'ok','ok','Europe/Berlin'
         )`,
        [sid, userId, name, acc.email, smtpHost, smtpPort, enc, imapHost, imapPort],
      );
    }
    report.steps.senders = "ok";

    await client.query(`INSERT INTO lead_lists (id, user_id, name) VALUES ($1,$2,'Forge Live List')`, [
      listId,
      userId,
    ]);
    await client.query(
      `INSERT INTO leads (id, user_id, list_id, email, first_name, last_name, company, status)
       VALUES ($1,$2,$3,$4,'Alex','Lead','Acme Test','pending')`,
      [leadId, userId, listId, leadTo.email],
    );
    report.steps.leads = "ok";

    await client.query(
      `INSERT INTO email_templates (id, user_id, name, subject, body_text, body_html, format)
       VALUES ($1,$2,$3,$4,$5,'','text')`,
      [
        tplId,
        userId,
        "Forge Hello",
        "Hi {{first_name}} — forge e2e {{company}}",
        "Hello {{first_name}} {{last_name}},\n\nThis is a Forge live E2E from SmartReach.\nCompany: {{company}}\n\nThanks",
      ],
    );
    report.steps.template = "ok";

    // All-day window (start==end) + tiny delay so engine can fire immediately
    await client.query(
      `INSERT INTO campaigns (
         id, user_id, name, status, lead_list_id, template_id,
         business_days_only, sending_timezone, sending_window_start, sending_window_end,
         daily_limit, min_delay_sec, max_delay_sec, max_emails_per_sender_per_day,
         stop_on_reply, retry_failed, retry_count, started_at
       ) VALUES (
         $1,$2,'Forge Live Campaign','running',$3,$4,
         false,'Europe/Berlin','00:00','00:00',
         100,5,10,50,
         true,true,2,$5
       )`,
      [campaignId, userId, listId, tplId, now()],
    );
    await client.query(`INSERT INTO campaign_senders (campaign_id, sender_id) VALUES ($1,$2),($1,$3)`, [
      campaignId,
      s1,
      s2,
    ]);
    await client.query(
      `INSERT INTO campaign_leads (id, campaign_id, lead_id, status) VALUES ($1,$2,$3,'queued')`,
      [clId, campaignId, leadId],
    );
    await client.query("COMMIT");
    report.steps.campaign = { ok: true, campaignId };
    fs.writeFileSync(
      path.join(EVID, "campaign_create.json"),
      JSON.stringify(
        {
          at: now(),
          campaignId,
          userId,
          senders: [mask(senderA.email), mask(senderB.email)],
          lead: mask(leadTo.email),
          window: "00:00==00:00 all-day Europe/Berlin",
          minDelaySec: 5,
        },
        null,
        2,
      ),
    );

    // Poll for engine send (Sentinel live engine ticks every 3s)
    const deadline = Date.now() + 90_000;
    let last = null;
    while (Date.now() < deadline) {
      const r = await statsQuery(client, campaignId);
      last = r.rows[0];
      const job = await client.query(
        `SELECT status, message_id, left(coalesce(last_error,''),120) AS err, sent_at
         FROM email_jobs WHERE campaign_id=$1 ORDER BY created_at DESC LIMIT 3`,
        [campaignId],
      );
      last.jobs = job.rows.map((j) => ({
        status: j.status,
        messageId: j.message_id ? String(j.message_id).slice(0, 48) : null,
        err: j.err || null,
        sentAt: j.sent_at,
      }));
      if (Number(last.jobs_sent) > 0 || Number(last.jobs_failed) > 0 || Number(last.sent) > 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    report.steps.sendPoll = last;
    fs.writeFileSync(path.join(EVID, "stats_after_send.json"), JSON.stringify({ at: now(), ...last }, null, 2));

    const liveSent =
      last?.jobs?.some((j) => j.status === "sent" && j.messageId && !String(j.messageId).startsWith("dry-run")) ||
      false;
    report.steps.liveSend = liveSent ? "PASS" : Number(last?.jobs_failed) > 0 ? "FAIL" : "TIMEOUT/GAP";

    // If sent, try reply from lead mailbox → sender, then wait for IMAP sync
    if (liveSent) {
      const jobRow = await client.query(
        `SELECT ej.message_id, ej.to_email, sa.email AS from_email
         FROM email_jobs ej JOIN sender_accounts sa ON sa.id = ej.sender_id
         WHERE ej.campaign_id=$1 AND ej.status='sent' ORDER BY ej.sent_at DESC NULLS LAST LIMIT 1`,
        [campaignId],
      );
      const jr = jobRow.rows[0];
      report.steps.outbound = {
        to: mask(jr.to_email),
        from: mask(jr.from_email),
        messageId: jr.message_id ? String(jr.message_id).slice(0, 64) : null,
      };

      // Send reply via SMTP from lead mailbox
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: leadTo.email, pass: password },
          tls: { rejectUnauthorized: false },
        });
        const info = await transporter.sendMail({
          from: leadTo.email,
          to: jr.from_email,
          subject: `Re: Hi Alex — forge e2e Acme Test`,
          text: "Thanks — Forge reply for Unibox/IMAP sync test.",
          inReplyTo: jr.message_id || undefined,
          references: jr.message_id || undefined,
        });
        transporter.close();
        report.steps.replySmtp = { ok: true, messageId: String(info.messageId || "").slice(0, 64) };
      } catch (e) {
        report.steps.replySmtp = { ok: false, error: String(e.message || e).slice(0, 160) };
        report.blockers.push("Reply SMTP from lead mailbox failed");
      }

      // Wait for engine IMAP sync (every 8s)
      const syncDeadline = Date.now() + 60_000;
      let replies = 0;
      while (Date.now() < syncDeadline) {
        const rr = await client.query(`SELECT count(*)::int AS n FROM replies WHERE campaign_id=$1`, [campaignId]);
        replies = rr.rows[0].n;
        if (replies > 0) break;
        const cl = await client.query(`SELECT status FROM campaign_leads WHERE id=$1`, [clId]);
        if (cl.rows[0]?.status === "replied") break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      const afterSync = await statsQuery(client, campaignId);
      report.steps.imapUnibox = {
        replies: Number(afterSync.rows[0].replies),
        campaignLeadStatus: (
          await client.query(`SELECT status FROM campaign_leads WHERE id=$1`, [clId])
        ).rows[0]?.status,
      };
      fs.writeFileSync(
        path.join(EVID, "imap_unibox.json"),
        JSON.stringify({ at: now(), ...report.steps.imapUnibox, replySmtp: report.steps.replySmtp }, null, 2),
      );
      if (Number(afterSync.rows[0].replies) === 0) {
        report.blockers.push(
          "IMAP/Unibox: no replies row after outbound+reply within 60s — gap for Atlas/Relay (engine sync or threading)",
        );
      }
    } else {
      report.blockers.push(
        "Live campaign send did not complete within 90s — check engine logs / sender decrypt / window",
      );
    }

    // Final masked job dump
    const jobs = await client.query(
      `SELECT status, left(coalesce(message_id,''),60) AS mid, left(coalesce(last_error,''),160) AS err,
              left(to_email,2)||'…@'||split_part(to_email,'@',2) AS to_masked
       FROM email_jobs WHERE campaign_id=$1`,
      [campaignId],
    );
    report.jobs = jobs.rows;
    fs.writeFileSync(path.join(EVID, "e2e_report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    report.blockers.push(String(e.message || e).slice(0, 200));
    fs.writeFileSync(path.join(EVID, "e2e_report.json"), JSON.stringify(report, null, 2));
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
