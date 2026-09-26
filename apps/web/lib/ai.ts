/**
 * Web application AI integration helpers.
 * Re-exports core AI engine methods and resolves user/workspace AI preferences.
 */
import { getDb } from "./db";
import { decryptSecret, schema } from "@smartreach/database";
import { eq } from "drizzle-orm";
import { SUPPORTED_AI_MODELS, type AiModelDefinition } from "@smartreach/shared";
import {
  generateEmailScriptOnTheFly,
  improveEmailCopy,
  previewBatchLeadEmails,
  type LeadProfile,
  type GeneratedScript,
  type GenerateOnTheFlyOptions,
  type ImproveCopyOptions,
  type AiEngineOptions,
} from "@smartreach/email-engine/ai";

export {
  generateEmailScriptOnTheFly,
  improveEmailCopy,
  previewBatchLeadEmails,
  type LeadProfile,
  type GeneratedScript,
  type GenerateOnTheFlyOptions,
  type ImproveCopyOptions,
  type AiEngineOptions,
  type AiModelDefinition,
  SUPPORTED_AI_MODELS,
};

export const DIVERSE_SAMPLE_LEADS: LeadProfile[] = [
  {
    id: "sample-1",
    email: "marcus.vance@apexsystems.de",
    firstName: "Marcus",
    lastName: "Vance",
    company: "Apex Systems GmbH",
    jobTitle: "VP of Engineering",
    industry: "Enterprise Infrastructure",
    website: "apexsystems.de",
    location: "Berlin, Germany",
    customFields: { annual_revenue: "$25M", team_size: "140" },
  },
  {
    id: "sample-2",
    email: "sarah.chen@cloudscale.io",
    firstName: "Sarah",
    lastName: "Chen",
    company: "CloudScale",
    jobTitle: "Head of Growth & Demand Gen",
    industry: "Cloud & DevTools",
    website: "cloudscale.io",
    location: "San Francisco, CA",
    customFields: { tech_stack: "AWS, Kubernetes, Next.js" },
  },
  {
    id: "sample-3",
    email: "alexander.wright@novusfintech.co.uk",
    firstName: "Alexander",
    lastName: "Wright",
    company: "Novus Payments",
    jobTitle: "Chief Operating Officer",
    industry: "Fintech & Payments",
    website: "novusfintech.co.uk",
    location: "London, UK",
    customFields: { market: "European B2B" },
  },
  {
    id: "sample-4",
    email: "elena.sorokina@datavault.ai",
    firstName: "Elena",
    lastName: "Sorokina",
    company: "DataVault Security",
    jobTitle: "Director of Product",
    industry: "Cybersecurity & Compliance",
    website: "datavault.ai",
    location: "Zurich, Switzerland",
    customFields: { compliance: "GDPR, SOC2 Type II" },
  },
  {
    id: "sample-5",
    email: "david.miller@logiport.net",
    firstName: "David",
    lastName: "Miller",
    company: "LogiPort Global",
    jobTitle: "VP of Supply Chain Solutions",
    industry: "Logistics & Freight Tech",
    website: "logiport.net",
    location: "Rotterdam, Netherlands",
    customFields: { fleet_size: "450 vessels" },
  },
  {
    id: "sample-6",
    email: "priya.sharma@talentflow.org",
    firstName: "Priya",
    lastName: "Sharma",
    company: "TalentFlow",
    jobTitle: "Head of Talent & Recruiting",
    industry: "HR Tech & Recruiting",
    website: "talentflow.org",
    location: "Austin, TX",
    customFields: { open_roles: "35 engineering reqs" },
  },
  {
    id: "sample-7",
    email: "lucas.dubois@medisync.fr",
    firstName: "Lucas",
    lastName: "Dubois",
    company: "MediSync Health",
    jobTitle: "Co-Founder & CEO",
    industry: "HealthTech & Diagnostics",
    website: "medisync.fr",
    location: "Paris, France",
    customFields: { stage: "Series A" },
  },
  {
    id: "sample-8",
    email: "clara.lindqvist@nordicsolar.se",
    firstName: "Clara",
    lastName: "Lindqvist",
    company: "Nordic Solar Systems",
    jobTitle: "Managing Director",
    industry: "CleanTech & Energy",
    website: "nordicsolar.se",
    location: "Stockholm, Sweden",
    customFields: { focus: "Commercial Solar installations" },
  },
  {
    id: "sample-9",
    email: "kenji.sato@autonoma.jp",
    firstName: "Kenji",
    lastName: "Sato",
    company: "Autonoma AI",
    jobTitle: "Chief Technology Officer",
    industry: "Industrial Robotics",
    website: "autonoma.jp",
    location: "Tokyo, Japan",
    customFields: { patents: "12 registered" },
  },
  {
    id: "sample-10",
    email: "hannah.becker@lumina-retail.de",
    firstName: "Hannah",
    lastName: "Becker",
    company: "Lumina Commerce",
    jobTitle: "VP of Digital Sales",
    industry: "Omnichannel E-commerce",
    website: "lumina-retail.de",
    location: "Munich, Germany",
    customFields: { gmv: "€60M/year" },
  },
];

/**
 * Fetch and decrypt AI credentials configured in workspace settings.
 */
export async function getWorkspaceAiOptions(userId: string): Promise<AiEngineOptions> {
  try {
    const db = getDb();
    const rows: any[] = await db
      .select({
        aiApiKeyEnc: schema.workspaceSettings.aiApiKeyEnc,
        aiProvider: schema.workspaceSettings.aiProvider,
        aiModel: schema.workspaceSettings.aiModel,
      })
      .from(schema.workspaceSettings)
      .where(eq(schema.workspaceSettings.userId, userId))
      .limit(1);

    const setting = rows[0];
    let apiKey: string | null = null;
    if (setting?.aiApiKeyEnc) {
      apiKey = decryptSecret(setting.aiApiKeyEnc);
    }

    return {
      apiKey,
      provider: setting?.aiProvider || "google",
      model: setting?.aiModel || "gemini-3.8-flash",
    };
  } catch {
    return {
      apiKey: null,
      provider: "google",
      model: "gemini-3.8-flash",
    };
  }
}
