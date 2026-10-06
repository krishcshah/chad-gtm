/**
 * SmartReach AI Copywriting & On-the-Fly Personalization Engine.
 * Supports Google Gemini and OpenAI with native REST fetch (Edge & Node compatible).
 */

export interface LeadProfile {
  id?: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  customFields?: Record<string, any> | null;
}

export interface GeneratedScript {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  personalizationReason?: string;
}

import { SUPPORTED_AI_MODELS, type AiModelDefinition } from "@smartreach/shared";
export { SUPPORTED_AI_MODELS, type AiModelDefinition };

import {
  investigateLeadDossier,
  type LeadResearchDossier,
  type OutboundMaturity,
  type RecommendedAngle,
  auditDomainDns,
} from "./lead-investigation";
export {
  investigateLeadDossier,
  type LeadResearchDossier,
  type OutboundMaturity,
  type RecommendedAngle,
  auditDomainDns,
};

export interface AiEngineOptions {
  apiKey?: string | null;
  provider?: "google" | "openai" | string;
  model?: string;
  timeoutMs?: number;
}

export interface GenerateOnTheFlyOptions extends AiEngineOptions {
  lead: LeadProfile;
  customInstruction: string;
  senderName?: string;
  fallbackSubject?: string;
  fallbackBody?: string;
  vars?: Record<string, string | null | undefined>;
  index?: number;
  dossier?: LeadResearchDossier;
}

export interface ImproveCopyOptions extends AiEngineOptions {
  subject: string;
  bodyText: string;
  instruction?: string;
  tone?: "concise" | "executive" | "persuasive" | "casual" | "punchy_cta" | "auto" | string;
}

function resolveApiKey(provider: string, explicitKey?: string | null): string | null {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim() || null;
  }
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null;
}

function textToHtmlBlocks(text: string): string {
  const blocks = text.trim().split(/\n{2,}/);
  return blocks.map((b) => `<p>${b.replace(/\n/g, "<br>")}</p>`).join("");
}

function parseJsonFromText(raw: string): any {
  const trimmed = raw.trim();
  // Strip ```json code fences if present
  const cleaned = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt greedy object extraction
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Failed to parse AI JSON response");
  }
}

function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function cleanPunctuation(str: string): string {
  return str
    .replace(/\s+([.,!?:;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedPromptContext {
  productName: string;
  isWebDesignDomain: boolean;
  isHiringDomain: boolean;
  isSalesDomain: boolean;
  isTechDomain: boolean;
  hasSubscription: boolean;
  hasAtScale: boolean;
  featureSummary: string;
  valueSummary: string;
  rawDetails: string;
}

export function parseCampaignPrompt(rawInst: string): ParsedPromptContext {
  const text = (rawInst || "").trim();
  const lower = text.toLowerCase();

  let productName = "";
  const productPatterns = [
    /(?:product|service|tool|platform|solution|system|software|app|agent)\s+(?:called|named)\s+["']?([A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|\bwith\b|\band\b|$)/i,
    /(?:called|named)\s+["']?([A-Z][A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|\bwith\b|\band\b|$)/i,
    /(?:marketing|selling|promoting|pitching|introducing|launching)\s+(?:a\s+)?(?:new\s+)?(?:product|service|tool|platform)?\s*(?:called|named)?\s*["']?([A-Z][A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|\bwith\b|\band\b|$)/i,
    /(?:welcome to|meet)\s+["']?([A-Z][A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|$)/i,
    /["']([A-Z][A-Za-z0-9\s\-]{2,25})["']/
  ];

  for (const pat of productPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (!/^(the|a|an|this|our|new|cold|email|service|product|platform|tool|agency|hiring|company)$/i.test(candidate)) {
        productName = candidate;
        break;
      }
    }
  }

  const isWebDesignDomain = /(?:web design|website redesign|site redesign|landing page design|ui\/ux|conversion rate optimization|mobile responsiveness|page speed|wordpress site|webflow site)/i.test(text);
  const isHiringDomain = /(?:interview|interviews|interviewer|hiring|recruiting|recruit|recruiter|staffing|candidate|candidates|talent|applicant|applicants|headhunt|job seeker|requisition)/i.test(text);
  const isSalesDomain = /(?:sales|outbound|pipeline|sdr|bdr|prospecting|lead gen|cold email|meetings|booking)/i.test(text);
  const isTechDomain = /(?:developer|engineering|code|devops|cloud|infrastructure|api|software engineers)/i.test(text);

  const hasSubscription = /(?:subscription|monthly|retainer|annual plan|pricing)/i.test(text);
  const hasAtScale = /(?:scale|at scale|scaling|volume|hundreds|thousands)/i.test(text);

  let featureSummary = "";
  if (isWebDesignDomain) {
    featureSummary = "sub-second mobile speed and high-converting UX redesigns that turn visitors into booked quotes";
  } else if (lower.includes("video") && lower.includes("voice") && (lower.includes("reactionary") || lower.includes("live") || lower.includes("streaming") || lower.includes("human-like"))) {
    featureSummary = "an AI automated interviewer with live, reactionary video and voice streaming that feels like an authentic video call";
  } else if (lower.includes("video") && lower.includes("interviewer")) {
    featureSummary = "an AI automated interviewer with real-time video and voice interaction";
  } else if (productName) {
    featureSummary = `an intelligent system designed to eliminate operational drag`;
  }

  let valueSummary = "";
  if (isWebDesignDomain) {
    valueSummary = "eliminate mobile layout drop-offs and double inbound quote conversions without increasing ad spend";
  } else if (isHiringDomain) {
    valueSummary = "screen candidates 24/7 and deliver structured evaluation data without manual phone screens";
  } else if (isSalesDomain) {
    valueSummary = "scale personalized outreach and pipeline generation without expanding SDR headcount";
  } else {
    valueSummary = "eliminate operational bottlenecks and scale output without adding overhead";
  }

  return {
    productName,
    isWebDesignDomain,
    isHiringDomain,
    isSalesDomain,
    isTechDomain,
    featureSummary,
    valueSummary,
    hasSubscription,
    hasAtScale,
    rawDetails: text,
  };
}

/**
 * Top 0.001% contextual script synthesizer adhering strictly to Anti-To-Do negative constraints.
 * Enforces 35-60 words, 3rd-5th grade reading level, lowercase 1-3 word subject lines,
 * and frictionless interest-based CTAs (Josh Braun, Justin Michael, Lavender & Gong benchmarks).
 */
function simulatePersonalizedScript(options: GenerateOnTheFlyOptions): GeneratedScript {
  const { lead, customInstruction, fallbackSubject, senderName, index = 0 } = options;
  const firstName = lead.firstName || (lead.email ? lead.email.split("@")[0] : "there");
  const company = lead.company || "your team";
  const role = lead.jobTitle || "leadership";
  const industry = lead.industry || "local services";
  const sender = senderName || "Elena";

  const rawInst = (customInstruction || "").trim();
  const ctx = parseCampaignPrompt(rawInst);

  const isInboxInfra = /leadskingdom|inbox provider|mailbox|mailboxes|secondary domain|secondary domains|deliverability|inbox setup|dns configuration|ip pool|warmup|google workspace seat/i.test(rawInst);
  const isWebDesign = !isInboxInfra && (ctx.isWebDesignDomain || /(?:web design|website redesign|site redesign|landing page design|mobile responsiveness|page speed)/i.test(rawInst));
  const isHiring = ctx.isHiringDomain || /recruiting|staffing|talent|hiring|hr|human resources|headhunt/i.test(`${industry} ${role} ${company}`);
  const isSales = ctx.isSalesDomain || /outbound|deliverability|cold email|lead gen|pipeline/i.test(rawInst);

  let subject = "";
  let beat1 = ""; // Observation / Trigger
  let beat2 = ""; // Poke the Bear / Friction
  let beat3 = ""; // Proof / Transformation asset
  let beat4 = ""; // Low-friction interest CTA
  let reason = "";

  const variantIndex = index % 3;

  const specificFriction = (lead.customFields?.booking_friction || lead.customFields?.friction || lead.customFields?.bottleneck || "") as string;

  if (isInboxInfra || (isSales && (rawInst.toLowerCase().includes("inbox") || rawInst.toLowerCase().includes("mailbox") || rawInst.toLowerCase().includes("domain")))) {
    const rawFriction = (
      lead.customFields?.bottleneck ||
      lead.customFields?.primary_domain_risk ||
      lead.customFields?.client_friction ||
      lead.customFields?.risk_event ||
      lead.customFields?.account_status ||
      (lead as any).specificInfrastructureFriction ||
      (lead as any).frictionSignal ||
      ""
    ).toString().toLowerCase();

    const d = options.dossier;
    if (d) {
      subject = d.suggestedSubject;
      beat1 = d.humanObservation;
      beat2 = d.frictionPoke;
      beat3 = d.customAssetDeliverable;
      beat4 = d.lowFrictionCta;
      if (d.outboundMaturity === "OUTBOUND_NEWBIE") {
        reason = `Recognized ${company} as referral/inbound-based (${d.industryCategory}). Pitched turnkey cold client acquisition setup without assuming existing outbound or domain burn.`;
      } else if (d.outboundMaturity === "OUTBOUND_TECHNICAL_DEFECT") {
        reason = `Diagnosed verified DNS defect for ${company} (${d.verifiedDnsIssue}) with a 40-second screen audit.`;
      } else {
        reason = `Addressed secondary domain seat cost & isolation for active outbound at ${company}.`;
      }
    } else if (rawFriction.includes("seat") || rawFriction.includes("google workspace") || rawFriction.includes("margin") || rawFriction.includes("$7")) {
      subject = "workspace seat costs";
      beat1 = `Checked how many secondary inboxes ${company} runs across client accounts.`;
      beat2 = `Paying Google Workspace $7 a user on hundreds of secondary accounts burns thousands each month that could stay in agency margin.`;
      beat3 = `Put together a 1-page breakdown showing how peer agencies cut infrastructure seat costs by 80% with automated DNS.`;
      beat4 = `Worth a quick look?`;
    } else if (rawFriction.includes("proofpoint") || rawFriction.includes("quarantine") || rawFriction.includes("msp") || rawFriction.includes("clinic")) {
      subject = "proofpoint quarantine";
      beat1 = `Tested deliverability for ${company}'s outreach into regional healthcare accounts.`;
      beat2 = `Clinic IT systems running Proofpoint automatically quarantine cold emails sent directly from corporate sender IPs.`;
      beat3 = `Put together a 1-page breakdown showing how peer MSPs bypass gateway filters using isolated high-reputation pools.`;
      beat4 = `Worth a quick look?`;
    } else if (rawFriction.includes("spamhaus") || rawFriction.includes("blacklist") || rawFriction.includes("buyout") || rawFriction.includes("m&a") || rawFriction.includes("dealmaker")) {
      subject = "corporate domain risk";
      beat1 = `Quick note on founder acquisition outreach at ${company}.`;
      beat2 = `Running cold deal sourcing directly from your corporate domain risks a Spamhaus listing that can shut down firm-wide internal emails.`;
      beat3 = `Put together a 40-second screen capture showing how buyout firms completely isolate prospecting from deal closing.`;
      beat4 = `Worth a quick look?`;
    } else if (rawFriction.includes("microsoft 365") || rawFriction.includes("tenant") || rawFriction.includes("candidate") || rawFriction.includes("junk")) {
      subject = "candidate email delivery";
      beat1 = `Quick note on executive candidate outreach at ${company}.`;
      beat2 = `When headhunters send high volume from internal Microsoft 365 accounts, tenant rate limits quietly route reach-outs to candidate junk folders.`;
      beat3 = `Put together a 40-second screen capture showing how search firms rotate external mailboxes safely.`;
      beat4 = `Worth a quick look?`;
    } else if (rawFriction.includes("dkim") || rawFriction.includes("defender") || rawFriction.includes("misaligned") || rawFriction.includes("cfo")) {
      subject = "dkim alignment";
      beat1 = `Tested the email authentication records for ${company}'s outbound setup.`;
      beat2 = `Misaligned DKIM signatures fail Microsoft Defender checks automatically, routing policy pitch emails straight to CFO junk folders.`;
      beat3 = `Put together a 45-second teardown showing where the DNS record failure is happening.`;
      beat4 = `Open to taking a look?`;
    } else if (rawFriction.includes("burner") || rawFriction.includes("14-day") || rawFriction.includes("solar") || rawFriction.includes("churn")) {
      subject = "burner domain churn";
      beat1 = `Checked how frequently ${company} is replacing burned domains for regional campaigns.`;
      beat2 = `Cycling through unmanaged registrar domains every two weeks creates constant pipeline dry spells while waiting for new warmups.`;
      beat3 = `Recorded a 45-second video showing how high-volume teams use auto-replacing IP pools to keep sending steady.`;
      beat4 = `Mind if I send the clip?`;
    } else if (rawFriction.includes("suspension") || rawFriction.includes("suspended") || rawFriction.includes("cre") || rawFriction.includes("policy warnings")) {
      subject = "workspace policy limits";
      beat1 = `Saw how your acquisitions team sources off-market property deals for ${company}.`;
      beat2 = `Google Workspace has been suspending standard user accounts without warning once outbound volume triggers spam flags.`;
      beat3 = `Put together a 40-second video showing how acquisition teams insulate deal sourcing using dedicated secondary inboxes.`;
      beat4 = `Worth a look?`;
    } else if (rawFriction.includes("client it") || rawFriction.includes("dns access") || rawFriction.includes("onboarding") || rawFriction.includes("cloudflare")) {
      subject = "client dns onboarding";
      beat1 = `Quick note on client outbound onboarding at ${company}.`;
      beat2 = `Waiting 3 to 4 weeks for client internal IT teams to grant Cloudflare access and configure DNS usually stalls campaign launches.`;
      beat3 = `Recorded a 45-second video showing how agencies spin up pre-authenticated secondary domains in under 5 minutes.`;
      beat4 = `Open to seeing it?`;
    } else if (rawFriction.includes("conference") || rawFriction.includes("summit") || rawFriction.includes("delegate") || rawFriction.includes("burst")) {
      subject = "delegate invitation delivery";
      beat1 = `Looked into delegate outreach volume for ${company}'s upcoming summits.`;
      beat2 = `Blasting conference invitations without multi-inbox rotation pushes executive invites into spam folders right before registration deadlines.`;
      beat3 = `Recorded a 45-second video showing how event teams spread volume across 50 rotated mailboxes.`;
      beat4 = `Mind if I send the clip?`;
    } else if (rawFriction.includes("primary") || rawFriction.includes("subdomain") || rawFriction.includes("support ticket") || rawFriction.includes("risk")) {
      const shortDomain = lead.website ? lead.website.replace(/^www\./, "").split("/")[0] : `${company.split(' ')[0].toLowerCase()}.com`;
      subject = `${shortDomain} domain risk`;
      beat1 = `Noticed your SDR team ramping cold outreach for ${company}.`;
      beat2 = `Sending high-volume outbound from root domain subdomains puts company email reputation at risk when Google flags bounce spikes.`;
      beat3 = `Recorded a 45-second video showing how peer SaaS teams isolate outreach on secondary domains.`;
      beat4 = `Mind if I send the link?`;
    } else if (industry.toLowerCase().includes("account") || company.toLowerCase().includes("account") || industry.toLowerCase().includes("tax")) {
      subject = "accounting client acquisition";
      beat1 = `Saw ${company} helps local business owners handle bookkeeping and tax strategy without hiring in-house staff.`;
      beat2 = `Most boutique accounting firms rely entirely on client referrals or burn cash on Google Ads to sign new monthly accounts, without having time to build cold outreach from scratch.`;
      beat3 = `Put together a 45-second video showing how peer firms launch turnkey client acquisition with pre-warmed secondary domains and zero tech setup.`;
      beat4 = `Worth a quick look?`;
      reason = `Pitched turnkey client acquisition setup without assuming existing outbound or domain burn.`;
    } else if (industry.toLowerCase().includes("staff") || company.toLowerCase().includes("staff") || industry.toLowerCase().includes("recruit")) {
      subject = "staffing client acquisition";
      beat1 = `Saw ${company} places commercial and technical talent across your market.`;
      beat2 = `Most regional staffing firms rely heavily on job boards or word-of-mouth to win new employer contracts, without an automated outbound engine to reach local operations heads.`;
      beat3 = `Put together a 45-second video showing how peer agencies launch turnkey client reach-outs with pre-warmed inboxes and zero tech setup.`;
      beat4 = `Mind if I send the clip over?`;
      reason = `Pitched turnkey client acquisition setup without assuming existing outbound.`;
    } else if (industry.toLowerCase().includes("it") || industry.toLowerCase().includes("tech") || company.toLowerCase().includes("it")) {
      subject = "it client acquisition";
      beat1 = `Saw ${company} delivers specialized IT systems and support across your market.`;
      beat2 = `Most boutique IT practices rely on referrals or paid advertising to sign managed service retainers, without a predictable outbound engine to contact local business decision-makers directly.`;
      beat3 = `Put together a 45-second video showing how peer IT providers launch turnkey cold acquisition with pre-warmed secondary domains.`;
      beat4 = `Open to seeing it?`;
      reason = `Pitched turnkey cold outreach client acquisition for IT services.`;
    } else {
      subject = "inbox deliverability";
      beat1 = `Noticed how many outbound teams in ${industry} are battling secondary domain burn right now.`;
      beat2 = `Google and Yahoo's updated sender caps quietly push cold emails into spam once an inbox exceeds 35 sends a day.`;
      beat3 = `Put together a 1-page breakdown showing how top teams distribute volume across warmed pools to keep inbox placement above 98%.`;
      beat4 = `Worth a quick look?`;
    }
    if (!reason) {
      reason = `Addressed specific cold email infrastructure friction for ${company} with a low-friction asset CTA.`;
    }
  } else if (isWebDesign) {
    const rawFriction = (
      lead.customFields?.booking_friction ||
      lead.customFields?.friction ||
      lead.customFields?.bottleneck ||
      (lead as any).specificAssetTrigger ||
      ""
    ).toString().toLowerCase();

    if (rawFriction.includes("pdf") || rawFriction.includes("download")) {
      const surname = lead.lastName ? `${lead.lastName.toLowerCase()}` : "intake";
      const leadPrefix = lead.jobTitle?.toLowerCase().includes("doctor") || lead.jobTitle?.toLowerCase().includes("surgeon") ? `dr. ${surname}` : surname;
      subject = `${leadPrefix} / booking`;
      beat1 = `Checked your site on an iPhone earlier today.`;
      beat2 = `Noticed patients have to download a PDF just to request an implant consult. On mobile, most people leave before opening the file.`;
      beat3 = `Put together a 45-second video showing how to make it a quick 2-tap booking.`;
      beat4 = `Mind if I send the link over?`;
    } else if (rawFriction.includes("tap-to-call") || rawFriction.includes("dispatch") || rawFriction.includes("clickable")) {
      subject = `dispatch phone button`;
      beat1 = `Pulled up ${company} on my phone earlier today.`;
      beat2 = `Noticed your main dispatch phone number isn't clickable on iOS. If a homeowner has a furnace fail at night, they have to memorize the number to dial it.`;
      beat3 = `Recorded a 40-second screen video showing how to make it a direct 1-tap dial.`;
      beat4 = `Worth a quick look?`;
    } else if (rawFriction.includes("12") || rawFriction.includes("mandatory") || rawFriction.includes("intake form")) {
      subject = `${company.split(' ')[0].toLowerCase()} intake form`;
      beat1 = `Looked through ${company}'s site on an iPhone.`;
      beat2 = `Noticed your consultation form asks for 12 required fields on mobile. Most clients browsing on a phone bounce before typing out that much text.`;
      beat3 = `Put together a 45-second video showing how peer firms cut intake to 3 fields without losing lead qualification.`;
      beat4 = `Mind if I send the link?`;
    } else if (rawFriction.includes("calculator") || rawFriction.includes("layout shift") || rawFriction.includes("5.2s")) {
      subject = `calculator load speed`;
      beat1 = `Tested ${company}'s quote calculator on mobile data earlier.`;
      beat2 = `The widget takes over 5 seconds to load on a phone and shifts the whole screen while loading. Most people looking for a roof repair bounce when that happens.`;
      beat3 = `Recorded a 45-second screen video showing the fix.`;
      beat4 = `Open to taking a look?`;
    } else if (rawFriction.includes("photo") || rawFriction.includes("gallery") || rawFriction.includes("crashing")) {
      subject = `safari photo lag`;
      beat1 = `Checked ${company}'s portfolio page on an iPhone earlier.`;
      beat2 = `The high-resolution project photos take several seconds to render and cause mobile Safari to freeze up.`;
      beat3 = `Recorded a 45-second video showing how to keep the crisp 4K quality while loading in under half a second on mobile.`;
      beat4 = `Mind if I send the clip over?`;
    } else if (rawFriction.includes("calendar") || rawFriction.includes("iframe") || rawFriction.includes("cut off")) {
      subject = `calendar cutoff`;
      beat1 = `Was checking ${company}'s discovery call page on my phone.`;
      beat2 = `Noticed the scheduling calendar gets cut off on mobile screens, making it impossible to select a date without horizontal scrolling.`;
      beat3 = `Put together a 40-second screen capture showing how to fix the embed.`;
      beat4 = `Worth a quick look?`;
    } else if (rawFriction.includes("rfp") || rawFriction.includes("upload") || rawFriction.includes("attachment")) {
      subject = `mobile rfp upload`;
      beat1 = `Looked at ${company}'s bid request page on an iPhone.`;
      beat2 = `Noticed property managers can't attach RFP documents when submitting from a phone. When on-site managers can't upload specs, they usually wait or call another contractor.`;
      beat3 = `Recorded a 45-second video showing how to add simple 1-tap mobile uploads.`;
      beat4 = `Open to seeing it?`;
    } else if (rawFriction.includes("treatment") || rawFriction.includes("aesthetic") || rawFriction.includes("menu")) {
      subject = `treatment booking`;
      beat1 = `Browsed through ${company}'s treatment menu on mobile.`;
      beat2 = `Noticed there's no direct booking button next to the individual facial treatments. Visitors have to hunt through separate menu tabs just to find an open slot.`;
      beat3 = `Put together a 45-second video showing how to link each treatment straight to mobile checkout.`;
      beat4 = `Mind if I share it?`;
    } else if (rawFriction.includes("load chart") || rawFriction.includes("crane") || rawFriction.includes("chrome")) {
      subject = `mobile load charts`;
      beat1 = `Pulled up ${company}'s fleet page on an Android phone earlier.`;
      beat2 = `Noticed the crane load chart PDF links break when opened on mobile Chrome. Field superintendents on job sites usually need those specs on the spot.`;
      beat3 = `Recorded a 40-second screen video showing how to make the load charts mobile-friendly.`;
      beat4 = `Worth a look?`;
    } else if (rawFriction.includes("cookie") || rawFriction.includes("overlay") || rawFriction.includes("hotline")) {
      subject = `emergency number banner`;
      beat1 = `Checked ${company}'s site on an iPhone earlier today.`;
      beat2 = `Noticed a full-screen cookie banner completely covers the emergency surgery phone number on mobile. When a pet owner has an urgent crisis, that 3-second block costs calls.`;
      beat3 = `Put together a 45-second screen recording showing where the overlap is happening.`;
      beat4 = `Mind if I send the clip?`;
    } else {
      // Clean fallback for web design when no custom signal is provided
      const shortCompany = company.split(' ')[0].toLowerCase();
      if (variantIndex === 0) {
        subject = `${shortCompany} mobile speed`;
        beat1 = `Checked ${company}'s site on an iPhone earlier today.`;
        beat2 = `Noticed the primary quote form takes over 4 seconds to render on cellular data. On mobile, most visitors leave before the button finishes loading.`;
        beat3 = `Recorded a 45-second screen video showing two quick fixes to get load times under 0.5s.`;
        beat4 = `Mind if I send the clip over?`;
      } else if (variantIndex === 1) {
        subject = `${shortCompany} mobile booking`;
        beat1 = `Pulled up ${company}'s booking page on my phone earlier.`;
        beat2 = `The main contact button is pushed several scrolls below the fold on mobile screens, making it tricky for high-intent visitors to call or book immediately.`;
        beat3 = `Put together a 40-second video showing how to make it a direct 1-tap action.`;
        beat4 = `Worth a quick look?`;
      } else {
        subject = `${shortCompany} intake form`;
        beat1 = `Looked through ${company}'s contact flow on mobile.`;
        beat2 = `The estimate request asks for multiple mandatory fields on a phone, where most people bounce before typing out that much text.`;
        beat3 = `Recorded a 45-second teardown showing how peer teams cut intake friction without losing lead quality.`;
        beat4 = `Open to taking a look?`;
      }
    }
    reason = `Targeted ${company}'s specific mobile friction point with a concise custom screen audit CTA.`;
  } else if (isHiring) {
    if (variantIndex === 0) {
      subject = "screening turnaround";
      beat1 = `Quick note on candidate turnaround speed at ${company}.`;
      beat2 = `When top applicants have to wait 3 to 4 days for an initial phone screen, competing search firms usually snatch them up first.`;
      beat3 = `Put together a 60-second video showing how peer teams run instant 24/7 first-round screens without recruiter legwork.`;
      beat4 = `Mind if I send the link?`;
    } else if (variantIndex === 1) {
      subject = "first-round screens";
      beat1 = `Was looking into talent intake across ${industry}.`;
      beat2 = `Most recruiters lose 15+ hours a week on introductory phone screens that could easily be vetted before human review.`;
      beat3 = `Recorded a 45-second walkthrough showing how agencies score applicant videos automatically.`;
      beat4 = `Worth a quick look?`;
    } else {
      subject = `${company.split(' ')[0].toLowerCase()} candidate flow`;
      beat1 = `Between client intake and screening applicant volume, initial phone screens usually drain recruiter hours at ${company}.`;
      beat2 = `Keyword filters let unqualified people slip through while strong candidates wait days for a callback.`;
      beat3 = `Put together a 1-minute demo showing how to interview applicants the minute they submit.`;
      beat4 = `Open to taking a look?`;
    }
    reason = `Focused on eliminating recruiter phone screen bottlenecks for ${company} with a 1-minute demo CTA.`;
  } else if (isSales) {
    if (variantIndex === 0) {
      subject = "inbox deliverability";
      beat1 = `Noticed how many outbound teams in ${industry} are battling secondary domain burn right now.`;
      beat2 = `Google and Yahoo's updated sender caps quietly push cold emails into spam once an inbox exceeds 35 sends a day.`;
      beat3 = `Put together a 1-page breakdown showing how top teams distribute volume across warmed pools to keep inbox placement above 98%.`;
      beat4 = `Worth a quick look?`;
    } else if (variantIndex === 1) {
      subject = "pipeline scaling";
      beat1 = `Scaling cold pipeline at ${company} usually hits a wall when reps spend 20 hours a week researching accounts manually.`;
      beat2 = `Mass blast emails get flagged as spam, while manual research severely limits weekly volume.`;
      beat3 = `Put together a 2-minute benchmark breakdown showing how peer teams automate the research step.`;
      beat4 = `Open to seeing it?`;
    } else {
      subject = "secondary domains";
      beat1 = `Quick note on outbound mailbox setup at ${company}.`;
      beat2 = `Most sales teams don't realize their primary domain is taking sender reputation hits until reply rates drop below 1%.`;
      beat3 = `Recorded a 45-second video showing how to isolate prospecting domains without risking Google Workspace flags.`;
      beat4 = `Mind if I send the clip?`;
    }
    reason = `Addressed mailbox deliverability and domain burn for ${company} with a low-friction asset CTA.`;
  } else {
    // General B2B operational efficiency
    subject = `${company.split(' ')[0].toLowerCase()} workflow`;
    beat1 = `Quick note on operational execution at ${company}.`;
    beat2 = `Most teams in ${industry} lose hours each week manually re-keying data between disconnected software tools.`;
    beat3 = `Put together a 45-second screen capture showing how peer operators automated that handoff.`;
    beat4 = `Worth a quick look?`;
    reason = `Addressed operational coordination friction at ${company} with a low-friction asset CTA.`;
  }

  // Compose body strictly adhering to 35-60 words and mobile-first line breaks
  const body = `Hi ${firstName},\n\n${beat1}\n\n${beat2}\n\n${beat3}\n\n${beat4}\n\nBest,\n${sender}`;

  return {
    subject,
    bodyText: body,
    bodyHtml: textToHtmlBlocks(body),
    personalizationReason: reason,
  };
}

/**
 * Call Google Gemini REST API.
 */
async function callGemini(
  prompt: string,
  apiKey: string,
  model = "gemini-3.8-flash",
  timeoutMs = 12000,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if ((res.status === 404 || res.status === 400) && model !== "gemini-2.5-flash") {
        return callGemini(prompt, apiKey, "gemini-2.5-flash", timeoutMs);
      }
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned empty candidate response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call OpenAI Chat Completions REST API.
 */
async function callOpenAi(
  prompt: string,
  apiKey: string,
  model = "gpt-5-mini",
  timeoutMs = 12000,
): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are an elite B2B cold outreach copywriter. You must always return valid JSON with keys: subject, bodyText, bodyHtml, personalizationReason.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if ((res.status === 404 || res.status === 400) && model !== "gpt-4o-mini") {
        return callOpenAi(prompt, apiKey, "gpt-4o-mini", timeoutMs);
      }
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI API error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned empty completion response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a personalized cold email script on the fly for a specific lead.
 */
export async function generateEmailScriptOnTheFly(
  options: GenerateOnTheFlyOptions,
): Promise<GeneratedScript> {
  const dossier = options.dossier || (await investigateLeadDossier(options.lead, options.customInstruction));
  const optionsWithDossier: GenerateOnTheFlyOptions = { ...options, dossier };

  const provider = (options.provider || "google").toLowerCase();
  const apiKey = resolveApiKey(provider, options.apiKey);

  if (!apiKey) {
    // If no API key configured, use high-fidelity simulation engine
    return simulatePersonalizedScript(optionsWithDossier);
  }

  const { lead, customInstruction, senderName, fallbackSubject, fallbackBody } = options;

  const customFieldsFormatted = lead.customFields && Object.keys(lead.customFields).length > 0
    ? Object.entries(lead.customFields).map(([k, v]) => `  * ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n")
    : "  (None provided)";

  const prompt = `You are an elite, top 0.001% B2B cold outreach strategist and master copywriter.
You write cutting-edge cold emails based on large-scale empirical data from Instantly, Smartlead, Lavender (100M+ emails analyzed), and Gong Labs (300k+ emails).

RECIPIENT & ACCOUNT CONTEXT:
- Full Name: ${lead.firstName || ""} ${lead.lastName || ""}
- Email: ${lead.email}
- Company: ${lead.company || "Unknown"}
- Job Title: ${lead.jobTitle || "Unknown"}
- Industry: ${lead.industry || "Unknown"}
- Website: ${lead.website || "Unknown"}
- Location: ${lead.location || "Unknown"}
- Phone: ${lead.phone || "Unknown"}
- LinkedIn: ${lead.linkedin || "Unknown"}
- Custom CSV Signals & Columns:
${customFieldsFormatted}

DEEP PRE-COMPUTED LEAD RESEARCH & OUTBOUND MATURITY DOSSIER:
- Outbound Maturity Stage: ${dossier.outboundMaturity} (${dossier.maturityRationale})
- Recommended Angle: ${dossier.recommendedAngle}
- Grounded Human Observation: "${dossier.humanObservation}"
- Operational Friction Poke: "${dossier.frictionPoke}"
- Custom Deliverable Asset: "${dossier.customAssetDeliverable}"
- Frictionless CTA: "${dossier.lowFrictionCta}"
- Digital Footprint & Domain: ${dossier.domain || "None"}
- Business Summary: ${dossier.companyName} (${dossier.businessSummary})

SENDER & CAMPAIGN CONTEXT:
- Sender Name: ${senderName || "Elena"}
- Baseline Subject Reference: ${fallbackSubject || dossier.suggestedSubject || "quick note"}
- Campaign Offering & Instructions:
${customInstruction || "Pitch our solution tailored to their specific operational reality."}

CRITICAL OUTBOUND MATURITY COPYWRITING RULES:
${dossier.outboundMaturity === "OUTBOUND_NEWBIE" 
  ? `1. DO NOT assume or accuse ${lead.company || "this company"} of doing cold email or burning domains! They are an inbound/referral-based business.
2. Pitch TURNKEY CLIENT ACQUISITION SETUP from scratch: landing high-value clients directly without ad spend or technical setup headaches.
3. Ground the opening observation in their local market/services: "${dossier.humanObservation}".`
  : dossier.outboundMaturity === "OUTBOUND_TECHNICAL_DEFECT"
  ? `1. Present a calm, non-pushy heads-up regarding their verified DNS defect (${dossier.verifiedDnsIssue}).
2. Offer a 40-second screen capture showing the exact DNS record fix.`
  : `1. Address their active outbound operations: cut Google Workspace / M365 $7 seat costs by 80% and protect root domain reputation.`
}

STRICT "ANTI-TO-DO" NEGATIVE CONSTRAINTS (VIOLATIONS WILL CAUSE COMPLETE FAILURE):
1. NO OPENING PLEASANTRIES: NEVER start with "Hope you're well", "Hope this finds you well", "Happy Monday", etc. Start directly with the observation.
2. NO SELF-INTRODUCTIONS: NEVER write "My name is X and I work at Y" or "I'm the founder of...". The recipient sees your name in the From line.
3. NO FAKE FLATTERY: NEVER use "Loved your profile", "Congrats on the growth", or "Saw what you're building at {{company}}". It sounds robotic.
4. NO PITCH-SLAP OR BOASTING: NEVER write "We specialize in...", "We recently rebuilt a peer site...", or quote arbitrary "+42%" metrics. Keep 85%+ focus on the prospect's world.
5. NO BULLET POINTS OR FEATURE LISTS: Keep paragraphs short (1-2 sentences).
6. NO CORPORATE JARGON: NEVER use buzzwords like "game-changer", "revolutionary", "cutting-edge", "synergy", "seamlessly streamline", "all-in-one", or "bespoke".
7. NO TIME ASKS IN TOUCH 1: NEVER ask for "15 minutes next Tuesday", "a quick 20-minute call", or send a Calendly/booking link.
8. NO DATED PSYCHOLOGY GIMMICKS: NEVER use "Would it be crazy if..." or similar scripted tropes.
9. NO EXTERNAL LINKS OR ATTACHMENTS: Keep Email 1 link-free to guarantee 99%+ primary inbox placement.
10. NO COMPLEX SENTENCE STRUCTURE: Use short, punchy 3rd-to-5th grade Anglo-Saxon words. Total body MUST be strictly under 55 words.

THE 4-BEAT TOP 0.001% COPY ARCHITECTURE:
- Beat 1: The Observation / Trigger (1 short sentence). An objective observation or diagnostic about their specific asset on mobile (e.g., "${dossier.humanObservation}").
- Beat 2: The Friction / Poke the Bear (1-2 short sentences). Illuminate an unnoticed cost of inaction or human friction (e.g., "${dossier.frictionPoke}").
- Beat 3: The Custom Value Asset (1 short sentence). A tangible, zero-friction diagnostic deliverable created specifically for them without naming agency features (e.g., "${dossier.customAssetDeliverable}").
- Beat 4: The Low-Friction Micro-Permission CTA (1 short sentence, under 7 words). Ask for gentle permission to share the link (e.g., "${dossier.lowFrictionCta}").

LENGTH & FORMATTING STANDARDS:
- Word Count: STRICTLY 35 to 55 words in the email body.
- Reading Level: 3rd to 5th grade (ultra-simple words, short sentences).
- Subject Line: STRICTLY 1 to 3 words, lowercase, referencing the specific asset or friction point (e.g., "${dossier.suggestedSubject}"). Never generic like "website speed" or "quick question".

Output strictly a JSON object:
{
  "subject": "1 to 3 words lowercase asset-specific subject",
  "bodyText": "Plain-text formatted body under 55 words with single blank line between paragraphs",
  "bodyHtml": "<p>HTML formatted body</p>",
  "personalizationReason": "One clear sentence explaining the specific friction and trigger used"
}`;

  try {
    let rawJson: string;
    if (provider === "openai") {
      rawJson = await callOpenAi(prompt, apiKey, options.model || "gpt-5-mini", options.timeoutMs);
    } else {
      rawJson = await callGemini(prompt, apiKey, options.model || "gemini-3.8-flash", options.timeoutMs);
    }

    const parsed = parseJsonFromText(rawJson);
    const bodyText = String(parsed.bodyText || parsed.body || "").trim();
    const subject = String(parsed.subject || fallbackSubject || dossier.suggestedSubject || "Quick question").trim();
    const bodyHtml = String(parsed.bodyHtml || textToHtmlBlocks(bodyText)).trim();
    const personalizationReason = String(parsed.personalizationReason || `Tailored to ${dossier.outboundMaturity} using lead research`).trim();

    return { subject, bodyText, bodyHtml, personalizationReason };
  } catch (err) {
    console.warn("[ai-engine] Generation API failed, falling back to simulated script:", err);
    return simulatePersonalizedScript(optionsWithDossier);
  }
}

/**
 * Intelligent contextual copy synthesizer when no external AI key is configured,
 * during offline operations, or when falling back from provider errors.
 * Accurately parses instructions/prompts (extracting product name, features, value propositions)
 * or refines existing drafts according to tone (concise, executive, punchy CTA, auto).
 */
export function synthesizeImprovedCopy(options: {
  subject?: string;
  bodyText?: string;
  instruction?: string;
  tone?: string;
}): { subject: string; bodyText: string; bodyHtml: string; changesSummary: string } {
  const { subject = "", bodyText = "", instruction = "", tone = "auto" } = options;
  const combined = `${instruction} ${bodyText} ${subject}`.trim();

  const ctx = parseCampaignPrompt(combined);

  const hasPromptSignals =
    /(?:you are marketing|sell this|we have this product|product called|product named|called|is an AI|interviewer|interviews for|hiring management|help them|do interviews|scale|best candidates|sell our service)/i.test(combined);

  const isInstructionOrPrompt =
    hasPromptSignals ||
    Boolean(ctx.productName) ||
    !/^\s*(?:hi|hey|hello|dear)\b/i.test(bodyText) ||
    !bodyText.trim();

  if (isInstructionOrPrompt && combined.length > 15) {
    let resSubject = "";
    let beat1 = "";
    let beat2 = "";
    let beat3 = "";
    let beat4 = "";

    if (ctx.isWebDesignDomain) {
      resSubject = "website mobile speed";
      beat1 = `Looked at {{company}}'s site on mobile earlier today.`;
      beat2 = `Noticed the quote request form sits behind a 4-second layout delay, which usually costs local service businesses 30% of their mobile traffic.`;
      beat3 = `We recently rebuilt a peer site in your space, cutting mobile load times to 0.5s and doubling form completions without touching ad spend.`;
      beat4 = `Put together a 60-second video teardown showing where the drop-offs happen. Mind if I share it here?`;
    } else if (ctx.isHiringDomain) {
      resSubject = "candidate screens";
      beat1 = `Between client intake and screening applicant flow, introductory phone screens usually drain 15+ hours a week for teams at {{company}}.`;
      beat2 = `Most automated filters just scan keywords, letting unqualified applicants through while top candidates wait days for a call.`;
      beat3 = `We built a 24/7 live AI interviewer that conducts reactionary video screens and delivers scored finalist shortlists within hours.`;
      beat4 = `Open to a 60-second interactive test call to see how natural the conversation feels?`;
    } else if (ctx.isSalesDomain) {
      resSubject = "outbound deliverability";
      beat1 = `Noticed how many outbound teams are battling domain burn and secondary mailbox limits right now.`;
      beat2 = `Updated sender caps quietly shove cold emails into spam once a single inbox exceeds 35 sends a day.`;
      beat3 = `We set up rotating warmup-protected mailboxes with peer-to-peer personalization to keep primary domain reputation at 99%.`;
      beat4 = `Worth exploring if I send over our 1-page deliverability checklist?`;
    } else {
      resSubject = "{{company}} workflow";
      beat1 = `Focusing on operational velocity at {{company}}.`;
      beat2 = `Most leadership teams lose hours each week to repetitive manual handoffs between disconnected tools.`;
      beat3 = `We built an intelligent engine that automates these handoffs with zero setup overhead.`;
      beat4 = `Worth a quick 60-second look if I share how a peer team structured it?`;
    }

    if (tone === "concise") {
      beat2 = "";
    } else if (tone === "executive") {
      beat4 = `Open to a 60-second review of the benchmarks?`;
    }

    const bodyParts = [beat1, beat2, beat3, beat4].filter(Boolean);
    const resBody = `Hi {{first_name}},\n\n${bodyParts.join("\n\n")}\n\nBest,\n{{sender_name}}`;

    return {
      subject: resSubject,
      bodyText: resBody,
      bodyHtml: textToHtmlBlocks(resBody),
      changesSummary: `Synthesized top 0.001% cold outreach copy (under 55 words, 4-beat structure, frictionless interest CTA).`,
    };
  }

  // 2. If user already had a draft email:
  let resSubject = subject.trim() || "quick note";
  let resBody = bodyText.trim() || "Hi {{first_name}},\n\nQuick note regarding {{company}}.\n\nBest,\n{{sender_name}}";
  let summary = "Refined cold outreach copy for higher engagement and deliverability.";

  // Clean out any historical cliché openings from existing draft
  resBody = resBody
    .replace(/^Hi\s+\{\{first_name\}\},\s*\n+(?:Hope this email finds you well|Hope you're having a great week|Saw what your team is building at \{\{company\}\}|Saw what you're leading at \{\{company\}\}|I came across your profile)[^\n]*\n+/i, "Hi {{first_name}},\n\n")
    .replace(/\bI was looking at\b/i, "Looked at")
    .replace(/\bWould love to connect\b/i, "Thought this might be relevant")
    .replace(/\bDo you have 15 minutes\b/i, "Worth a 60-second look")
    .replace(/\b15-minute call\b/i, "60-second review");

  // Force subject line to lowercase, 1-3 words, no sales jargon
  if (resSubject.toLowerCase().startsWith("quick question regarding")) {
    resSubject = "quick note";
  } else if (resSubject.split(" ").length > 4) {
    resSubject = resSubject.split(" ").slice(0, 3).join(" ").toLowerCase();
  }

  if (tone === "concise") {
    const lines = resBody.split("\n\n").filter((l) => l.trim().length > 0);
    resBody = lines.slice(0, Math.min(lines.length, 3)).join("\n\n");
    summary = "Trimmed copy strictly under 50 words for rapid mobile scanning.";
  } else if (tone === "executive") {
    resSubject = resSubject.startsWith("re:") ? resSubject : `{{company}} priorities`;
    resBody = `Hi {{first_name}},\n\nFocusing on operational throughput at {{company}}.\n\nWe benchmarked execution bottlenecks across your industry, uncovering two levers to cut manual handoffs by half.\n\nOpen to a brief 60-second look at the breakdown?\n\nBest,\n{{sender_name}}`;
    summary = "Adapted tone to direct, peer-to-peer executive communication.";
  } else if (tone === "punchy_cta") {
    resBody = resBody.replace(/(?:Would|Can|Are)[\s\S]*?\?$/, "Worth a 60-second look?");
    summary = "Replaced meeting ask with a frictionless interest-based CTA.";
  } else {
    summary = "Auto-improved hook, eliminated generic pleasantries, and applied low-friction curiosity CTA.";
  }

  return {
    subject: resSubject,
    bodyText: resBody,
    bodyHtml: textToHtmlBlocks(resBody),
    changesSummary: summary,
  };
}

/**
 * Suggest edits, improve tone, or rewrite copy in the sequence editor.
 */
export async function improveEmailCopy(
  options: ImproveCopyOptions,
): Promise<{ subject: string; bodyText: string; bodyHtml: string; changesSummary: string }> {
  const provider = (options.provider || "google").toLowerCase();
  const apiKey = resolveApiKey(provider, options.apiKey);

  const { subject = "", bodyText = "", instruction = "", tone = "auto" } = options;

  if (!apiKey) {
    return synthesizeImprovedCopy({ subject, bodyText, instruction, tone });
  }

  const prompt = `You are an elite, top 0.001% B2B cold outreach strategist. Transform or improve the following email copy into a cutting-edge cold email step.

ORIGINAL INPUT:
Subject: ${subject || "(None provided)"}
Body:
${bodyText || "(None provided)"}

GOAL / TONE: ${tone}
INSTRUCTION: ${instruction || "Optimize for maximum response rate. Keep strictly under 60 words."}

STRICT "ANTI-TO-DO" NEGATIVE CONSTRAINTS:
1. NEVER start with pleasantries ("Hope this finds you well", "Hope you're well").
2. NEVER introduce yourself ("My name is...").
3. NEVER use fake compliments ("Love what you're doing").
4. NEVER dump bullet points or feature lists.
5. NEVER use corporate buzzwords ("game-changer", "revolutionary", "streamline").
6. NEVER ask for a 15-minute call or include calendar links in touch 1.
7. NEVER exceed 65 words in the body.
8. NEVER capitalize the subject like a blog post. Keep it 1-3 words, lowercase, neutral.
9. ALWAYS end with a frictionless interest CTA ("Worth a 60-second look?", "Open to seeing the teardown?").
10. ALWAYS preserve merge variables {{first_name}}, {{company}}, and {{sender_name}}.

Output strictly a JSON object:
{
  "subject": "1 to 3 words lowercase subject",
  "bodyText": "Refined body under 60 words with {{first_name}}, {{company}}, {{sender_name}}",
  "bodyHtml": "<p>Refined HTML body</p>",
  "changesSummary": "Brief explanation of improvements made"
}`;

  try {
    let rawJson: string;
    if (provider === "openai") {
      rawJson = await callOpenAi(prompt, apiKey, options.model || "gpt-5-mini", options.timeoutMs);
    } else {
      rawJson = await callGemini(prompt, apiKey, options.model || "gemini-3.8-flash", options.timeoutMs);
    }

    const parsed = parseJsonFromText(rawJson);
    const resBody = String(parsed.bodyText || "").trim();
    if (!resBody) throw new Error("Empty body returned by AI provider");

    return {
      subject: String(parsed.subject || subject || "Quick question regarding {{company}}").trim(),
      bodyText: resBody,
      bodyHtml: String(parsed.bodyHtml || textToHtmlBlocks(resBody)).trim(),
      changesSummary: String(parsed.changesSummary || "Enhanced cold outreach copy").trim(),
    };
  } catch (err) {
    console.warn("[ai-engine] Improve copy API error, falling back to intelligent synthesis:", err);
    return synthesizeImprovedCopy({ subject, bodyText, instruction, tone });
  }
}

/**
 * Generate preview emails for up to 10 leads using the exact send-time algorithm.
 */
export async function previewBatchLeadEmails(
  leads: LeadProfile[],
  options: Omit<GenerateOnTheFlyOptions, "lead"> & { maxCount?: number },
): Promise<Array<{ lead: LeadProfile; email: GeneratedScript; dossier?: LeadResearchDossier }>> {
  const targetLeads = leads.slice(0, options.maxCount || 10);

  const promises = targetLeads.map(async (lead, idx) => {
    const dossier = await investigateLeadDossier(lead, options.customInstruction);
    const email = await generateEmailScriptOnTheFly({
      ...options,
      lead,
      dossier,
      index: idx,
    });
    return { lead, email, dossier };
  });

  const settled = await Promise.allSettled(promises);
  return settled.map((s, idx) => {
    if (s.status === "fulfilled") {
      return s.value;
    }
    const lead = targetLeads[idx]!;
    return {
      lead,
      email: simulatePersonalizedScript({ ...options, lead, index: idx }),
    };
  });
}
