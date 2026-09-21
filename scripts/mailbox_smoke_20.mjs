/**
 * Smoke-test MAIL_ACCOUNT_01..20 against shared MAIL_SMTP_* / MAIL_IMAP_*.
 * Loads /home/box/.config/smart-reach/mail.env (or MAIL_ENV_FILE).
 * Writes masked results only — never passwords.
 */
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) throw new Error(`mail env missing: ${filePath}`);
  const mode = fs.statSync(filePath).mode & 0o777;
  if (mode & 0o077) {
    console.warn(`[warn] mail env mode ${mode.toString(8)} is group/world readable; prefer 600`);
  }
  for (const line of fs.readFileSync(filePath, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function maskEmail(email) {
  const [u, d] = String(email).split("@");
  const local = (u || "?").slice(0, 2) + "…";
  return `${local}@${d || "?"}`;
}

async function testSmtp({ host, port, user, pass }) {
  const secure = Number(port) === 465;
  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure,
    auth: { user, pass },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: false },
  });
  const t0 = Date.now();
  try {
    await transporter.verify();
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    const msg = String(err?.response || err?.message || err).slice(0, 160);
    return { ok: false, error: msg, latencyMs: Date.now() - t0 };
  } finally {
    try {
      transporter.close();
    } catch {
      /* noop */
    }
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    }),
  ]);
}

async function testImap({ host, port, user, pass }) {
  const t0 = Date.now();
  let client;
  try {
    client = new ImapFlow({
      host,
      port: Number(port),
      secure: Number(port) === 993,
      auth: { user, pass },
      logger: false,
      socketTimeout: 15_000,
      greetingTimeout: 12_000,
    });
    // Prevent unhandled 'error' from crashing the process after we catch connect failures
    client.on("error", () => {});
    await withTimeout(client.connect(), 20_000, "IMAP connect");
    await withTimeout(client.mailboxOpen("INBOX"), 10_000, "IMAP mailboxOpen");
    try {
      await withTimeout(client.logout(), 5_000, "IMAP logout");
    } catch {
      try {
        client.close();
      } catch {
        /* noop */
      }
    }
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    const msg = String(err?.responseText || err?.message || err).slice(0, 160);
    try {
      if (client) {
        try {
          client.close();
        } catch {
          /* noop */
        }
      }
    } catch {
      /* noop */
    }
    return { ok: false, error: msg, latencyMs: Date.now() - t0 };
  }
}

async function main() {
  const envPath =
    process.env.MAIL_ENV_FILE ||
    "/home/box/.config/smart-reach/mail.env";
  const env = loadEnvFile(envPath);
  const smtpHost = env.MAIL_SMTP_HOST;
  const smtpPort = env.MAIL_SMTP_PORT || "465";
  const imapHost = env.MAIL_IMAP_HOST;
  const imapPort = env.MAIL_IMAP_PORT || "993";
  const password = env.MAIL_PASSWORD;
  if (!smtpHost || !imapHost || !password) {
    throw new Error("MAIL_SMTP_HOST / MAIL_IMAP_HOST / MAIL_PASSWORD required");
  }

  const rows = [];
  let smtpOk = 0;
  let imapOk = 0;

  // Sequential to avoid hammering the mail host / socket storms
  for (let i = 1; i <= 20; i++) {
    const key = `MAIL_ACCOUNT_${String(i).padStart(2, "0")}`;
    const email = env[key];
    if (!email) {
      rows.push({
        index: i,
        key,
        account: null,
        smtp: "FAIL",
        imap: "FAIL",
        smtpError: "missing account",
        imapError: "missing account",
      });
      continue;
    }
    const smtp = await testSmtp({ host: smtpHost, port: smtpPort, user: email, pass: password });
    const imap = await testImap({ host: imapHost, port: imapPort, user: email, pass: password });
    if (smtp.ok) smtpOk++;
    if (imap.ok) imapOk++;
    rows.push({
      index: i,
      key,
      account: maskEmail(email),
      smtp: smtp.ok ? "OK" : "FAIL",
      imap: imap.ok ? "OK" : "FAIL",
      smtpLatencyMs: smtp.latencyMs,
      imapLatencyMs: imap.latencyMs,
      ...(smtp.ok ? {} : { smtpError: smtp.error }),
      ...(imap.ok ? {} : { imapError: imap.error }),
    });
    console.log(
      `${key} ${maskEmail(email)} smtp=${smtp.ok ? "OK" : "FAIL"} imap=${imap.ok ? "OK" : "FAIL"}`,
    );
  }

  const out = {
    at: new Date().toISOString(),
    envFile: envPath,
    smtpHost,
    smtpPort: Number(smtpPort),
    imapHost,
    imapPort: Number(imapPort),
    total: 20,
    smtpOk,
    imapOk,
    smtpFail: 20 - smtpOk,
    imapFail: 20 - imapOk,
    rows,
  };

  const targets = [
    path.resolve("_forge_evidence/mailbox_smoke_20.json"),
    path.resolve("_forge_evidence/wave_campaign_mail/mailbox_smoke_20.json"),
  ];
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, JSON.stringify(out, null, 2) + "\n");
  }
  console.log(`\nSUMMARY smtpOk=${smtpOk}/20 imapOk=${imapOk}/20`);
  console.log(`wrote ${targets.join(" , ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
