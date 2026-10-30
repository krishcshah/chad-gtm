/**
 * SmartReach / ChadGTM Deep Pre-Computation Lead Research & Investigation Layer.
 * Analyzes lead digital footprint, checks real DNS authentication records,
 * and determines Outbound Maturity Stage (OUTBOUND_NEWBIE vs OUTBOUND_ACTIVE vs OUTBOUND_TECHNICAL_DEFECT).
 */

import { execSync } from "node:child_process";
import type { LeadProfile } from "./ai";

export type OutboundMaturity =
  | "OUTBOUND_NEWBIE"
  | "OUTBOUND_ACTIVE"
  | "OUTBOUND_TECHNICAL_DEFECT";

export type RecommendedAngle =
  | "TURNKEY_OUTBOUND_LAUNCH"
  | "SECONDARY_SEAT_COST_SLASH"
  | "TECHNICAL_DNS_REMEDIATION"
  | "LOCAL_SERVICE_FRICTION"
  | "CAMPAIGN_VALUE_ANGLE";

/**
 * Context for user-defined campaigns. When provided, lead research must serve
 * the user's offer — not AutoGTM's own inbox-infrastructure pitch.
 */
export interface CampaignResearchContext {
  companyName: string;
  companySummary?: string;
  valueProposition?: string;
  angle?: string;
  cta?: string;
  painPoints?: string[];
  offerTitle?: string;
  targetTitles?: string[];
  /** Only true for AutoGTM's own outbound-infrastructure offer. */
  isOutboundInfrastructure?: boolean;
}

export interface LeadResearchDossier {
  companyName: string;
  contactName: string;
  role: string;
  location: string;
  domain: string;
  industryCategory: string;
  businessSummary: string;
  outboundMaturity: OutboundMaturity;
  maturityRationale: string;
  verifiedDnsIssue?: string;
  recommendedAngle: RecommendedAngle;
  humanObservation: string;
  frictionPoke: string;
  customAssetDeliverable: string;
  lowFrictionCta: string;
  suggestedSubject: string;
  contextualPromptNote: string;
}

/**
 * Safely extract root domain from website or email address.
 */
export function extractCleanDomain(website?: string | null, email?: string | null): string {
  if (website && website.trim()) {
    try {
      let raw = website.trim();
      if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
      const hostname = new URL(raw).hostname.toLowerCase();
      return hostname.replace(/^www\./i, "");
    } catch {
      return website.trim().replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "").toLowerCase();
    }
  }
  if (email && email.includes("@")) {
    const domainPart = email.split("@")[1]?.toLowerCase().trim();
    if (domainPart && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(domainPart)) {
      return domainPart;
    }
  }
  return "";
}

/**
 * Perform empirical DNS audit using system resolver (nslookup).
 * Checks _dmarc TXT record and root domain SPF TXT.
 */
export function auditDomainDns(domain: string): { hasDefect: boolean; description?: string } {
  if (!domain || domain.includes("localhost") || domain.endsWith(".local")) {
    return { hasDefect: false };
  }

  try {
    // 1. Check DMARC
    let dmarcMissing = false;
    try {
      const dmarcCmd = `nslookup -type=txt _dmarc.${domain}`;
      const dmarcOut = execSync(dmarcCmd, { timeout: 2500, stdio: ["pipe", "pipe", "pipe"] }).toString();
      if (
        dmarcOut.includes("Non-existent domain") ||
        dmarcOut.includes("can't find") ||
        dmarcOut.includes("NXDOMAIN") ||
        !dmarcOut.toLowerCase().includes("v=dmarc1")
      ) {
        dmarcMissing = true;
      }
    } catch (e: any) {
      const errOut = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
      if (errOut.includes("Non-existent domain") || errOut.includes("can't find") || errOut.includes("NXDOMAIN")) {
        dmarcMissing = true;
      }
    }

    if (dmarcMissing) {
      return {
        hasDefect: true,
        description: `Missing DMARC TXT record on _dmarc.${domain} (causes Yahoo and Google 2024 bulk filters to reject or quarantine outreach)`,
      };
    }

    // 2. Check SPF
    try {
      const spfCmd = `nslookup -type=txt ${domain}`;
      const spfOut = execSync(spfCmd, { timeout: 2500, stdio: ["pipe", "pipe", "pipe"] }).toString();
      if (!spfOut.toLowerCase().includes("v=spf1")) {
        return {
          hasDefect: true,
          description: `Missing SPF record on ${domain} root domain`,
        };
      }
    } catch {}

    return { hasDefect: false };
  } catch {
    return { hasDefect: false };
  }
}

/**
 * Infer specific business category and core function based on industry, company, and title.
 */
function inferBusinessProfile(lead: LeadProfile): { category: string; summary: string } {
  const company = lead.company || "the company";
  const ind = (lead.industry || "").toLowerCase();
  const loc = lead.location || "their market";
  const title = (lead.jobTitle || "").toLowerCase();

  if (ind.includes("account") || ind.includes("cpa") || ind.includes("tax") || company.toLowerCase().includes("accounting") || company.toLowerCase().includes("cpa")) {
    return {
      category: "Accounting & Financial Services",
      summary: `helps ${loc} business owners and founders handle bookkeeping, tax strategy, and advisory without hiring internal finance staff`,
    };
  }
  if (ind.includes("staffing") || ind.includes("recruit") || ind.includes("talent") || company.toLowerCase().includes("staffing")) {
    return {
      category: "Staffing & Recruiting",
      summary: `places professional, commercial, and technical talent across ${loc}`,
    };
  }
  if (ind.includes("information technology") || ind.includes("it service") || ind.includes("managed service") || ind.includes("msp")) {
    return {
      category: "IT & Managed Services",
      summary: `provides enterprise IT support, cloud management, and cybersecurity for organizations in ${loc}`,
    };
  }
  if (ind.includes("legal") || ind.includes("law") || company.toLowerCase().includes("law") || company.toLowerCase().includes("legal")) {
    return {
      category: "Legal Practice",
      summary: `provides specialized legal counsel and advisory for clients across ${loc}`,
    };
  }
  if (ind.includes("virtual assistant") || company.toLowerCase().includes("assistant")) {
    return {
      category: "Virtual Operations & Executive Support",
      summary: `provides dedicated administrative and operational support to busy executives and small teams`,
    };
  }
  if (ind.includes("software") || ind.includes("saas") || ind.includes("internet") || ind.includes("platform")) {
    return {
      category: "B2B SaaS / Technology",
      summary: `builds software solutions to automate and streamline workflows for modern teams`,
    };
  }
  if (ind.includes("marketing") || ind.includes("advertising") || company.toLowerCase().includes("agency") || company.toLowerCase().includes("marketing")) {
    return {
      category: "Digital Agency",
      summary: `helps commercial brands scale customer acquisition and market visibility`,
    };
  }

  return {
    category: lead.industry || "B2B Services",
    summary: `delivers specialized commercial services to clients across ${loc}`,
  };
}

/**
 * Pre-computes complete lead research dossier and determines outbound maturity.
 *
 * Legacy behavior (no context): AutoGTM's own inbox-infrastructure pitch.
 * New behavior (context supplied): generic, role-aware research for the user's
 * actual offer. This prevents every customer campaign from pitching mailboxes.
 */
export async function investigateLeadDossier(
  lead: LeadProfile,
  campaignInstruction?: string,
  context?: CampaignResearchContext
): Promise<LeadResearchDossier> {
  const companyName = lead.company || "your team";
  const firstName = lead.firstName || "there";
  const contactName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || firstName;
  const role = lead.jobTitle || "Executive";
  const location = lead.location || "your region";
  const domain = extractCleanDomain(lead.website, lead.email);

  const businessInfo = inferBusinessProfile(lead);

  if (context && !context.isOutboundInfrastructure && context.companyName?.trim()) {
    return buildCampaignDossier(lead, businessInfo, context, {
      companyName,
      contactName,
      role,
      location,
      domain,
    });
  }

  // 1. Check for verified technical defects (custom fields or live DNS check)
  const customBottleneck = (
    lead.customFields?.bottleneck ||
    lead.customFields?.dmarcStatus ||
    lead.customFields?.dmarc ||
    lead.customFields?.verifiableDnsCheck ||
    ""
  ).toString();

  let dnsDefect: { hasDefect: boolean; description?: string } =
    customBottleneck.toLowerCase().includes("missing") || customBottleneck.toLowerCase().includes("dmarc")
      ? { hasDefect: true, description: customBottleneck }
      : { hasDefect: false, description: undefined };

  if (!dnsDefect.hasDefect && domain) {
    dnsDefect = auditDomainDns(domain);
  }

  // 2. Assess Outbound Maturity
  let outboundMaturity: OutboundMaturity = "OUTBOUND_NEWBIE";
  let maturityRationale = "";
  let recommendedAngle: RecommendedAngle = "TURNKEY_OUTBOUND_LAUNCH";

  const isSalesOrg =
    /(?:sales development|sdr|bdr|outbound|demand gen|growth marketing|cold email|lead gen|pipeline director)/i.test(role) ||
    /(?:lead generation|sales outsourcing|demand generation)/i.test(lead.industry || "");

  const hasHighVolumeOutboundSignals =
    isSalesOrg ||
    /(?:sales development|sdr|bdr|outbound team|secondary inboxes|cold email volume|active outbound)/i.test(customBottleneck) ||
    Boolean(lead.customFields?.active_outbound);

  if (dnsDefect.hasDefect) {
    outboundMaturity = "OUTBOUND_TECHNICAL_DEFECT";
    recommendedAngle = "TECHNICAL_DNS_REMEDIATION";
    maturityRationale = `Empirically verified DNS authentication defect on domain (${dnsDefect.description || "missing DMARC record"}).`;
  } else if (hasHighVolumeOutboundSignals) {
    outboundMaturity = "OUTBOUND_ACTIVE";
    recommendedAngle = "SECONDARY_SEAT_COST_SLASH";
    maturityRationale = `Company has active sales development or outbound reach-out operations.`;
  } else {
    outboundMaturity = "OUTBOUND_NEWBIE";
    recommendedAngle = "TURNKEY_OUTBOUND_LAUNCH";
    maturityRationale = `Boutique/regional professional service (${businessInfo.category}). Relies on referrals, local reputation, or paid ads; not running dedicated secondary cold email infrastructure.`;
  }

  // 3. Formulate observations and custom deliverables
  let humanObservation = "";
  let frictionPoke = "";
  let customAssetDeliverable = "";
  let lowFrictionCta = "";
  let suggestedSubject = "";

  const shortCompany = companyName.split(" ")[0].toLowerCase();

  if (outboundMaturity === "OUTBOUND_TECHNICAL_DEFECT") {
    suggestedSubject = `${domain || shortCompany} email authentication`;
    humanObservation = `Tested the email authentication records for ${companyName}'s domain earlier today.`;
    frictionPoke = `Missing a DMARC record on _dmarc.${domain || companyName.toLowerCase() + ".com"} causes Google and Yahoo bulk filters to route outreach directly to spam.`;
    customAssetDeliverable = `Put together a 40-second screen capture showing the exact TXT record to add.`;
    lowFrictionCta = `Open to taking a look?`;
  } else if (outboundMaturity === "OUTBOUND_ACTIVE") {
    suggestedSubject = "secondary mailbox costs";
    humanObservation = `Saw ${companyName} runs outbound to acquire new B2B accounts.`;
    frictionPoke = `Paying Google Workspace $7 a user on secondary inboxes burns thousands monthly that could stay in margin.`;
    customAssetDeliverable = `Put together a 1-page breakdown showing how peer teams cut mailbox costs by 80% with automated DNS.`;
    lowFrictionCta = `Worth a quick look?`;
  } else {
    // OUTBOUND_NEWBIE: Turnkey Outbound Launch for companies relying on referrals or ads
    if (businessInfo.category.includes("Accounting")) {
      suggestedSubject = "accounting client acquisition";
      humanObservation = `Saw ${companyName} handles bookkeeping and tax advisory across ${location}.`;
      frictionPoke = `Most accounting firms rely on referrals or paid ads to sign clients, lacking an outbound engine.`;
      customAssetDeliverable = `Put together a 45-second clip showing how peer firms launch turnkey outreach with pre-warmed domains.`;
      lowFrictionCta = `Worth a quick look?`;
    } else if (businessInfo.category.includes("Staffing")) {
      suggestedSubject = "staffing client acquisition";
      humanObservation = `Saw ${companyName} places commercial and technical talent across ${location}.`;
      frictionPoke = `Most regional staffing firms rely on job boards or referrals, lacking an automated outbound engine.`;
      customAssetDeliverable = `Put together a 45-second clip showing how peer agencies launch turnkey outreach with pre-warmed inboxes.`;
      lowFrictionCta = `Mind if I share it?`;
    } else if (businessInfo.category.includes("IT")) {
      suggestedSubject = "it client acquisition";
      humanObservation = `Saw ${companyName} delivers specialized IT and cloud infrastructure across ${location}.`;
      frictionPoke = `Most IT firms rely on referrals or ad spend, lacking a predictable outbound engine for local accounts.`;
      customAssetDeliverable = `Put together a 45-second video showing how peer IT providers launch turnkey outreach with zero domain setup.`;
      lowFrictionCta = `Open to seeing it?`;
    } else if (businessInfo.category.includes("Virtual")) {
      suggestedSubject = "va client acquisition";
      humanObservation = `Saw ${companyName} provides dedicated executive support across ${location}.`;
      frictionPoke = `Most boutique firms grow through referrals alone, lacking an engine to start conversations with founders.`;
      customAssetDeliverable = `Put together a 45-second clip showing how peer agencies set up turnkey outreach with pre-warmed inboxes.`;
      lowFrictionCta = `Worth a quick look?`;
    } else {
      suggestedSubject = `${shortCompany} client acquisition`;
      humanObservation = `Saw ${companyName} delivers specialized commercial services across ${location}.`;
      frictionPoke = `Most boutique firms rely on referrals or ads, lacking a predictable engine to reach decision-makers.`;
      customAssetDeliverable = `Put together a 45-second clip showing how peer teams launch turnkey outreach with zero tech setup.`;
      lowFrictionCta = `Open to taking a look?`;
    }
  }

  const contextualPromptNote = `PRE-COMPUTED LEAD RESEARCH:
- Business: ${companyName} in ${location} (${businessInfo.category}).
- Outbound Maturity: ${outboundMaturity} (${maturityRationale})
- Recommended Angle: ${recommendedAngle}
- Grounded Human Observation: "${humanObservation}"
- Operational Friction Poke: "${frictionPoke}"
- Custom Deliverable Asset: "${customAssetDeliverable}"
- Frictionless CTA: "${lowFrictionCta}"
CRITICAL: ${
    outboundMaturity === "OUTBOUND_NEWBIE"
      ? "Do NOT assume or accuse them of sending spam or burning domains! They rely on referrals or ads. Pitch turnkey client acquisition setup from scratch at the lowest cost with zero tech headache."
      : outboundMaturity === "OUTBOUND_TECHNICAL_DEFECT"
      ? `Objectively mention their verified DNS defect (${dnsDefect.description}) without being pushy.`
      : "Focus on secondary domain seat cost reduction ($7/user Google Workspace seats) and domain isolation."
  }`;

  return {
    companyName,
    contactName,
    role,
    location,
    domain,
    industryCategory: businessInfo.category,
    businessSummary: businessInfo.summary,
    outboundMaturity,
    maturityRationale,
    verifiedDnsIssue: dnsDefect.description,
    recommendedAngle,
    humanObservation,
    frictionPoke,
    customAssetDeliverable,
    lowFrictionCta,
    suggestedSubject,
    contextualPromptNote,
  };
}

/**
 * Campaign-aware dossier. Grounded in the prospect's role and the user's offer,
 * with no AutoGTM-specific DNS/mailbox assumptions.
 */
function buildCampaignDossier(
  lead: LeadProfile,
  businessInfo: { category: string; summary: string },
  context: CampaignResearchContext,
  identity: {
    companyName: string;
    contactName: string;
    role: string;
    location: string;
    domain: string;
  }
): LeadResearchDossier {
  const { companyName, contactName, role, location, domain } = identity;
  const friction = roleFriction(role, lead.industry || businessInfo.category);
  const pains = (context.painPoints || []).filter(Boolean);
  const painIndex = Math.abs(hashString(`${companyName}:${role}`)) % Math.max(pains.length, 1);
  const chosenPain = pains[painIndex] || friction.poke;

  const fields = (lead.customFields || {}) as Record<string, unknown>;
  const trigger = String(
    fields.trigger ||
      fields.recent_news ||
      fields.hiring_signal ||
      fields.tech_stack ||
      fields.ice_breaker ||
      ""
  ).trim();

  const humanObservation = trigger
    ? `${companyName} is dealing with ${trigger} while scaling ${businessInfo.category.toLowerCase()}.`
    : `${companyName} is scaling ${businessInfo.category.toLowerCase()} across ${location}.`;

  const offerName = context.companyName.trim();
  const valueProposition =
    context.valueProposition || `a faster way to handle ${friction.area}`;

  const frictionPoke = chosenPain.endsWith(".") ? chosenPain : `${chosenPain}.`;
  const customAssetDeliverable = `Put together a 90-second teardown of how ${offerName} changes ${friction.area} for ${companyName}.`;
  const lowFrictionCta = (context.cta || "Worth a quick look?").replace(/[.?!]+$/, "?");

  return {
    companyName,
    contactName,
    role,
    location,
    domain,
    industryCategory: businessInfo.category,
    businessSummary: businessInfo.summary,
    outboundMaturity: "OUTBOUND_ACTIVE",
    maturityRationale: `Campaign-specific research for ${offerName}; outbound-maturity taxonomy not applicable.`,
    recommendedAngle: "CAMPAIGN_VALUE_ANGLE",
    humanObservation,
    frictionPoke,
    customAssetDeliverable,
    lowFrictionCta,
    suggestedSubject: friction.subject,
    contextualPromptNote: `CAMPAIGN-SPECIFIC RESEARCH:
- Prospect: ${companyName} (${businessInfo.category}, ${location})
- Role: ${role}
- Offer owner: ${offerName}
- Value proposition: ${valueProposition}
- Angle: ${context.angle || "direct value"}
- Chosen pain: ${chosenPain}
- Grounded observation: "${humanObservation}"
- Suggested asset: "${customAssetDeliverable}"
CRITICAL: Write about the prospect's world and the offer above. Never mention DNS, mailboxes, domains, or inbox warmup unless the offer explicitly does.`,
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function roleFriction(role: string, industry: string): { area: string; subject: string; poke: string } {
  const r = `${role} ${industry}`.toLowerCase();

  if (/(revenue|sales|growth|sdr|bdr|pipeline|demand gen|commercial)/.test(r)) {
    return {
      area: "pipeline coverage",
      subject: "pipeline coverage",
      poke: "Pipeline targets usually depend on more activity, not a better conversion path",
    };
  }
  if (/(engineer|technical|cto|developer|platform|infrastructure|data|security)/.test(r)) {
    return {
      area: "integration and delivery speed",
      subject: "integration debt",
      poke: "Every new tool adds another surface the team has to secure and maintain",
    };
  }
  if (/(operat|coo|supply|logistics|service delivery)/.test(r)) {
    return {
      area: "manual handoffs and operating cost",
      subject: "manual handoffs",
      poke: "The process works until volume exposes every manual step",
    };
  }
  if (/(finance|cfo|controller|accounting|procurement)/.test(r)) {
    return {
      area: "cost per outcome and forecast accuracy",
      subject: "cost per outcome",
      poke: "Spend is visible, but the cost of the underlying workflow usually is not",
    };
  }
  if (/(marketing|brand|content|communications)/.test(r)) {
    return {
      area: "qualified demand and attribution",
      subject: "qualified demand",
      poke: "More channels rarely fix a conversion path that leaks",
    };
  }
  if (/(product|design|ux|research)/.test(r)) {
    return {
      area: "activation and retention",
      subject: "activation drop-off",
      poke: "Most teams can see the drop-off but cannot isolate the cause",
    };
  }
  if (/(people|talent|hr|recruit)/.test(r)) {
    return {
      area: "time-to-hire and candidate quality",
      subject: "time to hire",
      poke: "Sourcing volume masks the cost of a slow, manual screen",
    };
  }
  return {
    area: "throughput and cost of the current workflow",
    subject: "workflow cost",
    poke: "The current process works, but it does not scale without more people",
  };
}
