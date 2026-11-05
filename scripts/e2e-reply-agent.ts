/**
 * Live end-to-end test of the autopilot reply loop against REAL mailboxes.
 *
 *   sender pool (system mailboxes) ──campaign email──▶ prospect mailboxes
 *   prospect mailboxes ──real replies (threaded)──▶ sender pool
 *   engine: IMAP sync → reply agent → reply / escalate (+ client email)
 *
 * Usage (local DB only — never point this at production):
 *   E2E_MAILBOXES=/path/to/mailboxes.json npx tsx scripts/e2e-reply-agent.ts <phase>
 *
 * mailboxes.json (keep it OUT of git):
 *   {
 *     "smtpHost": "mail.example.com", "imapHost": "mail.example.com",
 *     "password": "…",                       // shared test password
 *     "senders":  ["sdr1@example.work", "sdr2@example.work"],
 *     "client":   "founder@example.work",    // receives "agent needs you" mail
 *     "prospects": [
 *       { "email": "dana@example.cloud", "first": "Dana", "persona": "resource" },
 *       { "email": "sam@example.cloud",  "first": "Sam",  "persona": "meeting" },
 *       { "email": "riley@example.cloud","first": "Riley","persona": "resource_again" },
 *       { "email": "jo@example.cloud",   "first": "Jo",   "persona": "unsubscribe" }
 *     ]
 *   }
 *
 * Phases:
 *   setup            create admin/pool senders, client run, campaign with ONLY the test prospects
 *   send             schedule + send the opener (processor clock fast-forwarded past jitter)
 *   reply <persona> [script]  prospect(s) with that persona reply to the latest message in-thread
 *                             (optionally using another persona's script, e.g. a follow-up question)
 *   agent            IMAP sync + reply agent tick
 *   inspect          print DB state and what landed in each inbox
 *   teardown         delete the test campaign/run/senders
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { schema } from "@smartreach/database";
import { createDb } from "@smartreach/database/connection";
import { encryptSecret } from "@smartreach/database/crypto";
import { schedulerTick } from "../packages/email-engine/src/scheduler";
import { processTick } from "../packages/email-engine/src/processor";
import { syncTick } from "../packages/email-engine/src/sync-replies";
import { replyAgentTick } from "../packages/email-engine/src/reply-agent";

config({ path: path.resolve(__dirname, "../apps/web/.env.local") });

const TAG = "e2e-reply-agent";
const ADMIN_ID = "usr_e2e_pool_admin";
const RUN_ID = "run_e2e_reply_agent";
const BOOKING = "https://cal.com/northwind-e2e/intro";

type Prospect = { email: string; first: string; persona: string };
interface Cfg {
  smtpHost: string;
  imapHost: string;
  password: string;
  senders: string[];
  client: string;
  prospects: Prospect[];
}

const cfgPath = process.env.E2E_MAILBOXES;
if (!cfgPath || !fs.existsSync(cfgPath)) {
  console.error("Set E2E_MAILBOXES to the mailbox JSON file (see header).");
  process.exit(1);
}
const cfg: Cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const url = process.env.DATABASE_URL || "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error(`Refusing to run against a non-local database: ${url.replace(/:[^:@/]+@/, ":***@")}`);
  process.exit(1);
}
const { db, close } = createDb(url);

const REPLIES: Record<string, (first: string) => string> = {
  resource: () =>
    "Hi Alex,\n\nThis is timely, we're rebuilding our reporting stack this quarter. Before a call, could you send over a case study deck from a similar company?\n\nThanks,\nDana",
  meeting: () => "Sounds interesting. Happy to chat next week - send me a link to book a time.\n\nSam",
  resource_again: () =>
    "Hey, curious about this. Do you have a case study deck I could look at with the team?\n\nRiley",
  unsubscribe: () => "Not interested, please remove me from your list.",
  question_unknown: () => "Does this work with our on-prem Oracle warehouse?",
};

async function clientUserId(): Promise<string> {
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, cfg.client)).limit(1);
  if (!u) throw new Error(`Client ${cfg.client} has no account yet — sign up in the local app first.`);
  return u.id;
}

async function setup() {
  const clientId = await clientUserId();
  // Admin who owns the shared pool.
  await db
    .insert(schema.users)
    .values({ id: ADMIN_ID, name: "Pool Admin (e2e)", email: `pool-admin+${TAG}@localhost.test`, emailVerified: true, role: "admin" } as any)
    .onConflictDoNothing();

  const senderIds: string[] = [];
  for (const [i, email] of cfg.senders.entries()) {
    const id = `snd_${TAG}_${i}`;
    senderIds.push(id);
    await db.delete(schema.senderAccounts).where(eq(schema.senderAccounts.id, id));
    await db.insert(schema.senderAccounts).values({
      id,
      userId: ADMIN_ID,
      senderName: "Alex Rivera",
      fromName: "Alex Rivera",
      email,
      smtpHost: cfg.smtpHost,
      smtpPort: 465,
      smtpUsername: email,
      smtpPasswordEnc: encryptSecret(cfg.password),
      smtpSecurity: "ssl",
      imapHost: cfg.imapHost,
      imapPort: 993,
      imapUsername: email,
      imapPasswordEnc: encryptSecret(cfg.password),
      dailyLimit: 30,
      hourlyLimit: 30,
      status: "active",
      smtpStatus: "ok",
      imapStatus: "ok",
      isSystemPool: true,
      // Only look at mail from now on so old test traffic is ignored.
      lastSyncAt: new Date().toISOString(),
    } as any);
  }

  await teardownCampaign();
  const listId = `lst_${TAG}`;
  const campaignId = `cmp_${TAG}`;
  await db.insert(schema.leadLists).values({ id: listId, userId: clientId, name: "E2E prospects" });
  for (const p of cfg.prospects) {
    await db.insert(schema.leads).values({
      id: `lead_${TAG}_${p.persona}`,
      userId: clientId,
      listId,
      email: p.email,
      firstName: p.first,
      lastName: "Tester",
      company: `${p.first} Co`,
      jobTitle: "Head of Data",
      status: "new",
      tags: [TAG],
    } as any);
  }
  const templateId = `tpl_${TAG}`;
  await db.insert(schema.emailTemplates).values({
    id: templateId,
    userId: clientId,
    name: "E2E opener",
    subject: "reporting at {{company}}",
    bodyText: "Hi {{first_name}},\n\nNorthwind turns warehouse data into board-ready reporting in a day instead of a sprint.\n\nWorth a look for {{company}}?\n\nAlex",
    bodyHtml: "",
    format: "text",
  } as any);
  await db.insert(schema.campaigns).values({
    id: campaignId,
    userId: clientId,
    name: "AutoGTM: Northwind (e2e)",
    status: "running",
    leadListId: listId,
    templateId,
    sendingWindowStart: "00:00",
    sendingWindowEnd: "23:59",
    dailyLimit: 50,
    minDelaySec: 45,
    maxDelaySec: 60,
    maxEmailsPerSenderPerDay: 30,
    stopOnReply: true,
    trackOpens: false,
    startedAt: new Date().toISOString(),
  } as any);
  await db.insert(schema.campaignSenders).values(senderIds.map((senderId) => ({ campaignId, senderId })));
  await db.execute(sql`
    INSERT INTO campaign_leads (id, campaign_id, lead_id, status, step_position)
    SELECT 'cl_' || l.id, ${campaignId}, l.id, 'queued', 1 FROM leads l WHERE l.list_id = ${listId}
    ON CONFLICT DO NOTHING`);
  await db.insert(schema.chadGtmRuns).values({
    id: RUN_ID,
    userId: clientId,
    url: "https://northwind.example",
    companyName: "Northwind Analytics",
    status: "active",
    businessOverview: { summary: "Northwind turns warehouse data into board-ready reporting." },
    icpProfile: {},
    offers: [{ title: "Reporting in a day", angle: "speed", valueProp: "Board-ready reporting in a day", cta: "Worth a look?" }],
    campaignId,
    bookingUrl: BOOKING,
    autopilot: true,
    replyAgentMode: "autopilot",
  } as any);
  console.log(`setup ok: client=${cfg.client} senders=${cfg.senders.join(",")} prospects=${cfg.prospects.length}`);
}

async function teardownCampaign() {
  const campaignId = `cmp_${TAG}`;
  await db.delete(schema.agentRequests).where(eq(schema.agentRequests.runId, RUN_ID));
  await db.delete(schema.chadGtmRuns).where(eq(schema.chadGtmRuns.id, RUN_ID));
  await db.delete(schema.uniboxMessages).where(eq(schema.uniboxMessages.campaignId, campaignId));
  await db.delete(schema.replies).where(eq(schema.replies.campaignId, campaignId));
  await db.delete(schema.emailJobs).where(eq(schema.emailJobs.campaignId, campaignId));
  await db.delete(schema.campaignLeads).where(eq(schema.campaignLeads.campaignId, campaignId));
  await db.delete(schema.campaignSenders).where(eq(schema.campaignSenders.campaignId, campaignId));
  await db.delete(schema.sequenceSteps).where(eq(schema.sequenceSteps.campaignId, campaignId));
  await db.delete(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, `tpl_${TAG}`));
  await db.delete(schema.leads).where(eq(schema.leads.listId, `lst_${TAG}`));
  await db.delete(schema.leadLists).where(eq(schema.leadLists.id, `lst_${TAG}`));
}

async function guardOnlyTestCampaignRunning() {
  const running: any[] = await db
    .select({ id: schema.campaigns.id, name: schema.campaigns.name })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.status, "running"));
  const others = running.filter((c) => c.id !== `cmp_${TAG}`);
  if (others.length > 0) {
    throw new Error(`Refusing to tick the engine: other running campaigns would send real mail: ${others.map((o) => o.name).join(", ")}`);
  }
}

async function send() {
  await guardOnlyTestCampaignRunning();
  const sched = await schedulerTick(db);
  console.log("scheduler:", JSON.stringify({ enqueued: sched.enqueued, skipped: sched.skipped }));
  // Fast-forward the processor clock past the 45–120s jitter for the test only.
  for (let i = 0; i < 4; i++) {
    const proc = await processTick(db, new Date(Date.now() + (i + 1) * 10 * 60_000));
    console.log("processor:", JSON.stringify(proc));
  }
}

function imapFor(email: string) {
  const c = new ImapFlow({ host: cfg.imapHost, port: 993, secure: true, auth: { user: email, pass: cfg.password }, logger: false });
  c.on("error", () => {});
  return c;
}

async function findLatestFrom(mailbox: string, fromAny: string[], subjectHint?: string) {
  const c = imapFor(mailbox);
  await c.connect();
  await c.mailboxOpen("INBOX");
  const since = new Date(Date.now() - 2 * 86_400_000);
  const uids = (await c.search({ since }, { uid: true })) || [];
  let hit: any = null;
  for await (const m of c.fetch(uids.slice(-60), { envelope: true, source: true }, { uid: true })) {
    const from = m.envelope?.from?.[0]?.address?.toLowerCase() || "";
    if (!fromAny.map((f) => f.toLowerCase()).includes(from)) continue;
    if (subjectHint && !String(m.envelope?.subject || "").toLowerCase().includes(subjectHint.toLowerCase())) continue;
    if (!hit || new Date(m.envelope?.date || 0) > new Date(hit.envelope?.date || 0)) hit = m;
  }
  await c.logout();
  return hit;
}

async function reply(persona: string, script?: string) {
  const targets = cfg.prospects.filter((p) => p.persona === persona);
  if (targets.length === 0) throw new Error(`no prospect with persona ${persona}`);
  for (const p of targets) {
    const msg = await findLatestFrom(p.email, cfg.senders);
    if (!msg) {
      console.log(`${p.email}: campaign email not found in inbox yet`);
      continue;
    }
    const body = (REPLIES[script || persona] || REPLIES.question_unknown!)(p.first);
    const to = msg.envelope.from[0].address;
    const t = nodemailer.createTransport({ host: cfg.smtpHost, port: 465, secure: true, auth: { user: p.email, pass: cfg.password } });
    const subj = String(msg.envelope.subject || "");
    await t.sendMail({
      from: `"${p.first} Tester" <${p.email}>`,
      to,
      subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`,
      text: body,
      inReplyTo: msg.envelope.messageId,
      references: msg.envelope.messageId,
    });
    t.close();
    console.log(`${p.email} → ${to}: replied as "${persona}"`);
  }
}

async function agent() {
  await guardOnlyTestCampaignRunning();
  // Make IMAP pick up replies from the last hour regardless of lastSyncAt skew.
  await db
    .update(schema.senderAccounts)
    .set({ lastSyncAt: new Date(Date.now() - 30 * 60_000).toISOString() })
    .where(inArray(schema.senderAccounts.email, cfg.senders));
  const sync = await syncTick(db);
  console.log("sync:", JSON.stringify(sync));
  const res = await replyAgentTick(db);
  console.log("reply agent:", JSON.stringify(res));
}

async function inspect() {
  const campaignId = `cmp_${TAG}`;
  const replies: any[] = await db
    .select({
      from: schema.replies.fromEmail,
      tag: schema.replies.tag,
      status: schema.replies.agentStatus,
      intent: schema.replies.agentIntent,
      summary: schema.replies.agentSummary,
      owner: schema.replies.userId,
    })
    .from(schema.replies)
    .where(eq(schema.replies.campaignId, campaignId));
  console.log("\nREPLIES");
  console.table(replies);
  const reqs: any[] = await db
    .select({ id: schema.agentRequests.id, kind: schema.agentRequests.kind, status: schema.agentRequests.status, title: schema.agentRequests.title, lead: schema.agentRequests.leadEmail, notified: schema.agentRequests.notifiedAt })
    .from(schema.agentRequests)
    .where(eq(schema.agentRequests.runId, RUN_ID));
  console.log("AGENT REQUESTS");
  console.table(reqs);
  const kb: any[] = await db.select({ title: schema.agentKnowledge.title, url: schema.agentKnowledge.url, used: schema.agentKnowledge.usageCount }).from(schema.agentKnowledge);
  console.log("KNOWLEDGE");
  console.table(kb);
  const sent: any[] = await db
    .select({ role: schema.uniboxMessages.fromRole, dir: schema.uniboxMessages.direction, from: schema.uniboxMessages.fromEmail, body: sql<string>`left(${schema.uniboxMessages.bodyText}, 90)` })
    .from(schema.uniboxMessages)
    .where(and(eq(schema.uniboxMessages.campaignId, campaignId)));
  console.log("UNIBOX MESSAGES");
  console.table(sent);

  console.log("INBOXES");
  for (const p of cfg.prospects) {
    const m = await findLatestFrom(p.email, cfg.senders, "re:");
    // (inbox check covers the last two days of the test mailboxes)
    console.log(`${p.persona.padEnd(15)} ${p.email}: ${m ? `agent reply "${m.envelope.subject}" @ ${m.envelope.date?.toISOString?.()}` : "no agent reply"}`);
  }
  const note = await findLatestFrom(cfg.client, cfg.senders, "agent needs you");
  console.log(`client ${cfg.client}: ${note ? `notification "${note.envelope.subject}"` : "no notification"}`);
}

async function main() {
  const [phase, arg] = process.argv.slice(2);
  try {
    if (phase === "setup") await setup();
    else if (phase === "send") await send();
    else if (phase === "reply") await reply(arg || "resource", process.argv[4]);
    else if (phase === "agent") await agent();
    else if (phase === "inspect") await inspect();
    else if (phase === "teardown") {
      await teardownCampaign();
      await db.delete(schema.senderAccounts).where(eq(schema.senderAccounts.userId, ADMIN_ID));
      console.log("teardown ok");
    } else console.log("phases: setup | send | reply <persona> | agent | inspect | teardown");
  } finally {
    await close?.();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
