/**
 * Campaign provisioning for AutoGTM runs.
 *
 * Shared by the manual calibration wizard and one-URL autopilot. Deliberately
 * NOT a "use server" module: these helpers take a trusted user/workspace id and
 * must never be callable from the browser.
 */
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { ensureOutreachSpintax, schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import type { Db } from "./db";
import { getMatchingDirectoryLeadsForExport } from "./leads-directory";
import type { CampaignResearchContext } from "./ai";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";

type RunRow = typeof schema.chadGtmRuns.$inferSelect;

/** How long a prospect is off-limits to every client after one campaign touches them. */
export const CONTACT_COOLDOWN_DAYS = 90;
/** Leads provisioned per autopilot campaign. */
export const LEADS_PER_CAMPAIGN = 500;

export function buildCampaignContext(
  run: RunRow,
  activeOffer: { title?: string; angle?: string; valueProp?: string; cta?: string }
): CampaignResearchContext {
  const overview = (run.businessOverview as any) || {};
  const icp = (run.icpProfile as any) || {};
  const isOwnOffer = /autogtm|chadgtm|smartreach/i.test(`${run.url || ""} ${run.companyName || ""}`);

  return {
    companyName: run.companyName || "our company",
    companySummary: overview.summary,
    valueProposition: activeOffer.valueProp,
    angle: activeOffer.angle,
    cta: activeOffer.cta,
    offerTitle: activeOffer.title,
    painPoints: Array.isArray(icp.painPoints) ? icp.painPoints : [],
    targetTitles: Array.isArray(icp.targetTitles) ? icp.targetTitles : [],
    isOutboundInfrastructure: isOwnOffer,
  };
}

export function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getTargetTitles(run: RunRow): string[] {
  const icp = (run.icpProfile as any) || {};
  const flat = Array.isArray(icp.targetTitles) ? icp.targetTitles : [];
  const personaTitles = Array.isArray(icp.personas)
    ? icp.personas.flatMap((p: any) => (Array.isArray(p?.titles) ? p.titles : []))
    : [];
  return Array.from(
    new Set(
      [...flat, ...personaTitles].map((t) => String(t || "").trim()).filter((t) => t.length >= 2)
    )
  ).slice(0, 8);
}

/**
 * Prefer leads whose titles match the ICP, then top up with industry-only
 * matches. Prevents a campaign from starving when title formats vary wildly.
 */
export function fetchTargetedLeads(
  industries: string[],
  targetTitles: string[],
  desired: number,
  offset: number
) {
  const base = {
    industries: industries.length > 0 ? industries : undefined,
    hasEmail: true,
  };
  if (targetTitles.length === 0) {
    return getMatchingDirectoryLeadsForExport(base, desired, offset);
  }

  const targeted = getMatchingDirectoryLeadsForExport({ ...base, jobTitles: targetTitles }, desired, offset);
  if (targeted.length >= desired) return targeted;

  const seen = new Set(targeted.map((lead) => lead.email.toLowerCase()));
  let fallback = getMatchingDirectoryLeadsForExport(base, desired * 3, offset);
  if (fallback.length === 0 && offset > 0) {
    // Niche industries can have fewer rows than the rotation offset.
    fallback = getMatchingDirectoryLeadsForExport(base, desired * 3, 0);
  }
  for (const lead of fallback) {
    if (targeted.length >= desired) break;
    const key = lead.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targeted.push(lead);
  }
  return targeted;
}

export function compactCustomFields(raw: Record<string, string> | undefined): Record<string, string> {
  if (!raw) return {};
  const skip = /^(email|first|last|full|name|job|title|company|industry|location|city|state|country|phone|website|linkedin)/i;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 12) break;
    if (skip.test(key)) continue;
    const text = String(value ?? "").trim();
    if (!text) continue;
    out[key] = text.slice(0, 200);
  }
  return out;
}

/**
 * Emails any client already put into a campaign inside the cooldown window.
 * Every client shares the same mailbox pool, so contacting one prospect from
 * two campaigns burns pool reputation and annoys the prospect.
 */
export async function recentlyContactedEmails(db: Db, emails: string[], now = new Date()): Promise<Set<string>> {
  const out = new Set<string>();
  if (emails.length === 0) return out;
  const since = new Date(now.getTime() - CONTACT_COOLDOWN_DAYS * 86_400_000).toISOString();
  const CHUNK = 500;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const batch = emails.slice(i, i + CHUNK);
    const rows: Array<{ email: string }> = await db
      .select({ email: schema.leads.email })
      .from(schema.leads)
      .innerJoin(schema.campaignLeads, eq(schema.campaignLeads.leadId, schema.leads.id))
      .where(and(inArray(schema.leads.email, batch), gte(schema.campaignLeads.createdAt, since)));
    for (const r of rows) out.add(r.email.toLowerCase());
  }
  return out;
}

/** Plain, offer-grounded opener used when no swipe samples were approved. */
export function defaultOpenerFromOffer(
  companyName: string,
  offer: { title?: string; valueProp?: string; cta?: string; angle?: string }
): { subject: string; bodyText: string; bodyHtml: string } {
  const value = (offer.valueProp || `${companyName} helps teams like {{company}} move faster.`).trim();
  const cta = (offer.cta || "Worth a quick look?").trim();
  const subjectSeed = (offer.title || offer.angle || "quick idea").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const subject = subjectSeed.split(/\s+/).slice(0, 4).join(" ") || "quick idea";
  const bodyText = `{Hi|Hey} {{first_name}},\n\n${value}\n\n${cta}\n\n{{sender_name}}`;
  const bodyHtml = `<p>{Hi|Hey} {{first_name}},</p><p>${value}</p><p>${cta}</p><p>{{sender_name}}</p>`;
  return { subject, bodyText, bodyHtml };
}

/** Lowercase only a leading capital so proper nouns later in the sentence survive. */
export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export interface LaunchRunInput {
  run: RunRow;
  userId: string;
  workspaceId: string | null;
  dailyLimit: number;
  approvedSamples: any[];
  selectedOfferIndex?: number;
}

/**
 * Provision list → leads → template → campaign → 3-step AI sequence → pool
 * senders → lead snapshot, then flip the run to active.
 */
export async function launchRunCampaign(db: Db, input: LaunchRunInput): Promise<{ campaignId: string; leadCount: number }> {
  const { run, userId, workspaceId } = input;
  const approvedSamples = Array.isArray(input.approvedSamples) ? input.approvedSamples : [];
  const dailyLimit = Math.min(500, Math.max(30, Math.round(input.dailyLimit || 30)));
  const industries = (run.selectedIndustries as string[]) || [];
  const dateStr = new Date().toISOString().slice(0, 10);
  const companyName = run.companyName || "Autonomous GTM";
  const calibratedProfile = (run.calibrationProfile as any) || {};

  // Fail before writing anything if there is no capacity to send from.
  const systemSenders: Array<{ id: string }> = await db
    .select({ id: schema.senderAccounts.id })
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.isSystemPool, true),
        eq(schema.senderAccounts.status, "active"),
        isNull(schema.senderAccounts.deletedAt)
      )
    );
  if (systemSenders.length === 0) {
    throw new Error(
      "No active shared mailboxes are available. Ask an admin to add or reactivate a system-pool sender before launching."
    );
  }

  // Leads: over-fetch, then drop anyone another campaign contacted recently.
  const leadOffset = stableHash(run.id) % 5000;
  const candidates = fetchTargetedLeads(industries, getTargetTitles(run), LEADS_PER_CAMPAIGN * 2, leadOffset);
  const contacted = await recentlyContactedEmails(db, candidates.map((c) => c.email.toLowerCase()));
  const matchingDirectoryLeads = candidates
    .filter((c) => !contacted.has(c.email.toLowerCase()))
    .slice(0, LEADS_PER_CAMPAIGN);

  if (matchingDirectoryLeads.length === 0) {
    throw new Error(
      candidates.length > 0
        ? "Every matching lead was contacted by another campaign in the last 90 days. Broaden the ICP industries."
        : "No verified leads match the selected industries. Refine the ICP or pick another industry facet."
    );
  }

  const listId = crypto.randomUUID();
  await db.insert(schema.leadLists).values({
    id: listId,
    userId,
    workspaceId,
    name: `${companyName} AutoGTM Leads (${dateStr})`,
  });

  const CHUNK = 100;
  for (let i = 0; i < matchingDirectoryLeads.length; i += CHUNK) {
    const batch = matchingDirectoryLeads.slice(i, i + CHUNK);
    await db
      .insert(schema.leads)
      .values(
        batch.map((dl) => ({
          id: crypto.randomUUID(),
          userId,
          workspaceId,
          listId,
          email: dl.email,
          firstName: dl.firstName,
          lastName: dl.lastName,
          company: dl.companyName,
          website: dl.companyWebsite,
          linkedin: dl.linkedinUrl,
          jobTitle: dl.jobTitle,
          location: dl.location,
          phone: dl.phone,
          industry: dl.industry,
          status: "new" as const,
          customFields: compactCustomFields(dl.rawAttributes),
          tags: ["autogtm", "b2b-verified"],
        }))
      )
      .onConflictDoNothing();
  }

  const offers = (run.offers as any[]) || [];
  const activeOffer = offers[input.selectedOfferIndex ?? 0] ||
    offers[0] || {
      title: "Direct Value Offer",
      angle: "Direct ROI",
      valueProp: "Accelerate your team's workflow and output.",
      cta: "Open to a brief look?",
    };

  // Baseline copy: approved swipe sample > calibrated template > offer-grounded opener.
  // This is what gets sent if on-the-fly generation is unavailable.
  const offerOpener = defaultOpenerFromOffer(companyName, activeOffer);
  const primarySample = approvedSamples[0] || {
    subject: calibratedProfile.calibratedSubjectTemplate || offerOpener.subject,
    bodyText: calibratedProfile.calibratedBodyTemplate || offerOpener.bodyText,
    bodyHtml: calibratedProfile.calibratedBodyTemplate ? "" : offerOpener.bodyHtml,
  };

  const finalSubject = primarySample.subject || offerOpener.subject;
  const finalBodyText = ensureOutreachSpintax(primarySample.bodyText || offerOpener.bodyText);
  const finalBodyHtml = ensureOutreachSpintax(
    primarySample.bodyHtml || `<p>${finalBodyText.replace(/\n/g, "<br/>")}</p>`
  );

  const templateId = crypto.randomUUID();
  await db.insert(schema.emailTemplates).values({
    id: templateId,
    userId,
    name: `${companyName} Calibrated Template`,
    subject: finalSubject,
    bodyText: finalBodyText,
    bodyHtml: finalBodyHtml,
    format: "text",
  });

  const campaignId = crypto.randomUUID();
  await db.insert(schema.campaigns).values({
    id: campaignId,
    userId,
    workspaceId,
    name: `AutoGTM: ${companyName}`,
    status: "running",
    leadListId: listId,
    templateId,
    dailyLimit,
    minDelaySec: 45,
    maxDelaySec: 120,
    maxEmailsPerSenderPerDay: 30, // hard per-mailbox ceiling
    stopOnReply: true,
    retryFailed: true,
    trackOpens: true,
    startedAt: nowIso(),
  });

  const styleExemplars: Array<{ subject: string; bodyText: string; recipientTitle?: string }> =
    Array.isArray(calibratedProfile.styleExemplars) && calibratedProfile.styleExemplars.length > 0
      ? calibratedProfile.styleExemplars
      : approvedSamples
          .filter((s) => s && s.approved !== false)
          .slice(0, 3)
          .map((s) => ({ subject: s.subject || "", bodyText: s.bodyText || "", recipientTitle: s.recipientTitle }));

  const sendContext = buildCampaignContext(run, activeOffer);
  const stepPrompt = (instruction: string) =>
    JSON.stringify({
      instruction,
      context: sendContext,
      styleExamples: styleExemplars,
      negativeConstraints: calibratedProfile.rejectionConstraints || [],
      requireSpintax: true,
    });

  const reSubject = finalSubject.toLowerCase().startsWith("re:") ? finalSubject : `re: ${finalSubject}`;
  const steps: Array<{ delayDays: number; subject: string; bodyText: string; prompt: string }> = [
    {
      delayDays: 0,
      subject: finalSubject,
      bodyText: finalBodyText,
      prompt: [
        calibratedProfile.customAiInstruction ||
          `Company: ${companyName}. Value offer: ${activeOffer.valueProp}. Angle: ${activeOffer.angle}. Call to action: ${activeOffer.cta}. Write a first-touch cold email in 35-70 words. No pleasantries, no self-intro, no feature dump. One specific observation, one friction, one low-friction permission question.`,
        `SPINTAX: include {Hi|Hey|Hello} and at least one other {a|b} variant group. Never spin names, companies, numbers, or factual claims.`,
        `Do not mention DNS, mailboxes, inbox warmup, or deliverability unless the campaign explicitly asks for it.`,
      ].join("\n\n"),
    },
    {
      delayDays: 3,
      subject: reSubject,
      bodyText: ensureOutreachSpintax(
        `Hi {{first_name}},\n\nOne more thought on this — ${lowerFirst((activeOffer.valueProp || "").replace(/\.$/, "")) || "happy to share how it would apply to {{company}}"}.\n\nWorth a look, or should I leave it?\n\n{{sender_name}}`
      ),
      prompt: `Write follow-up #1 (sent 3 days after initial message) for ${companyName}. Recipient is {{job_title}} at {{company}}. Never say "just checking in" or "following up". Add one new, specific reason this matters, grounded in: ${activeOffer.valueProp}. Strictly under 35 words. Low-friction permission CTA.`,
    },
    {
      delayDays: 4,
      subject: reSubject,
      bodyText: ensureOutreachSpintax(
        `Hi {{first_name}},\n\nAssuming the timing isn't right for {{company}}.\n\nShould I close the loop for now, or check back next quarter?\n\n{{sender_name}}`
      ),
      prompt: `Write follow-up #2 (final breakup email, sent 7 days after initial outreach) for ${companyName}. Recipient is {{job_title}} at {{company}}. Zero guilt, polite permission close. Under 25 words. Ask if we should close the loop or check back next quarter.`,
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const stepId = crypto.randomUUID();
    await db.insert(schema.sequenceSteps).values({
      id: stepId,
      campaignId,
      position: i + 1,
      delayDays: step.delayDays,
    });
    await db.insert(schema.sequenceStepVariants).values({
      id: crypto.randomUUID(),
      stepId,
      label: "A",
      subject: step.subject,
      bodyText: step.bodyText,
      bodyHtml: i === 0 ? finalBodyHtml : `<p>${step.bodyText.replace(/\n/g, "<br/>")}</p>`,
      aiGenerateOnTheFly: true,
      aiPrompt: stepPrompt(step.prompt),
    });
  }

  await db
    .insert(schema.campaignSenders)
    .values(systemSenders.map((s) => ({ campaignId, senderId: s.id })))
    .onConflictDoNothing();

  await ensureCampaignLeadSnapshot(db, campaignId, listId);

  await db
    .update(schema.chadGtmRuns)
    .set({
      status: "active",
      campaignId,
      dailyEmailLimit: dailyLimit,
      approvedEmailSamples: approvedSamples,
      updatedAt: nowIso(),
    })
    .where(eq(schema.chadGtmRuns.id, run.id));

  return { campaignId, leadCount: matchingDirectoryLeads.length };
}
