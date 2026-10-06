import { generateEmailScriptOnTheFly, type LeadProfile } from "../packages/email-engine/src/ai.ts";

export interface LeadsKingdomLead extends LeadProfile {
  icpType: string;
  sendingVolume: string;
  sendingPlatform: string;
  currentInfrastructure: string;
  specificInfrastructureFriction: string;
}

export const LEADS_KINGDOM_10_LEADS: LeadsKingdomLead[] = [
  {
    id: "lk-1",
    firstName: "Gavin",
    lastName: "Cross",
    email: "gavin@hypergrowthoutbound.io",
    company: "HyperGrowth Outbound",
    jobTitle: "Founder & CEO",
    industry: "B2B Lead Generation Agency",
    website: "hypergrowthoutbound.io",
    location: "Austin, TX",
    icpType: "Cold Outreach Agency (Managing 35+ Client Accounts)",
    sendingVolume: "150,000 emails/mo",
    sendingPlatform: "Smartlead",
    currentInfrastructure: "Manual Google Workspace seats ($7.20/user)",
    specificInfrastructureFriction: "Paying $2,800/mo on Google Workspace seats and losing 15 hours a week manually configuring DNS for new client onboarding",
    customFields: {
      client_count: "38 active clients",
      mailbox_count: "380 mailboxes",
      monthly_cost: "$2,736/mo",
      bottleneck: "Manual SPF/DKIM setup delays onboarding by 5 days per client",
    },
  },
  {
    id: "lk-2",
    firstName: "Siddharth",
    lastName: "Mehta",
    email: "sid@stackpulse.io",
    company: "StackPulse Analytics",
    jobTitle: "VP of Revenue & Growth",
    industry: "B2B SaaS (Series A DevOps)",
    website: "stackpulse.io",
    location: "San Francisco, CA",
    icpType: "High-Growth B2B SaaS Outbound Team",
    sendingVolume: "45,000 emails/mo",
    sendingPlatform: "Instantly",
    currentInfrastructure: "Sending directly from subdomain on primary root domain",
    specificInfrastructureFriction: "Primary stackpulse.io domain reputation dropping below 70% after SDRs ramped cold email volume",
    customFields: {
      sdr_headcount: "8 SDRs",
      primary_domain_risk: "Corporate support tickets bouncing",
      bottleneck: "Outbound sent from subdomains of primary domain without isolated infrastructure",
    },
  },
  {
    id: "lk-3",
    firstName: "Camilla",
    lastName: "Davenport",
    email: "camilla@apexexecsearch.com",
    company: "Apex Executive Search",
    jobTitle: "Managing Director",
    industry: "Executive Search & Staffing",
    website: "apexexecsearch.com",
    location: "New York, NY",
    icpType: "High-Ticket Retained Headhunting Firm",
    sendingVolume: "25,000 emails/mo",
    sendingPlatform: "Apollo / Outlook",
    currentInfrastructure: "Internal Microsoft 365 enterprise mailboxes",
    specificInfrastructureFriction: "Recruiters hitting Microsoft 365 daily outbound tenant rate limits and executive candidates landing in junk",
    customFields: {
      fee_per_placement: "$35,000",
      open_rate: "19%",
      bottleneck: "Candidate reach-outs hitting Microsoft 365 tenant sending caps",
    },
  },
  {
    id: "lk-4",
    firstName: "Tariq",
    lastName: "Al-Mansoor",
    email: "tariq@horizoninsure.com",
    company: "Horizon Risk & Insurance Partners",
    jobTitle: "Chief Commercial Officer",
    industry: "Commercial Insurance Brokerage",
    website: "horizoninsure.com",
    location: "Chicago, IL",
    icpType: "Mid-Market Commercial Insurance Brokerage",
    sendingVolume: "30,000 emails/mo",
    sendingPlatform: "Saleshandy",
    currentInfrastructure: "GoDaddy shared mailboxes",
    specificInfrastructureFriction: "Cold emails to Fortune 500 CFOs failing Microsoft Defender spam filters due to misaligned DKIM records",
    customFields: {
      avg_policy_size: "$120,000",
      bounce_rate: "8.4%",
      bottleneck: "Misaligned DKIM signatures failing Outlook enterprise spam filters",
    },
  },
  {
    id: "lk-5",
    firstName: "Nadia",
    lastName: "Vogel",
    email: "nadia@luminsolarleads.com",
    company: "Lumin Clean Energy Acquisition",
    jobTitle: "Head of Acquisition",
    industry: "Solar & Clean Energy Marketing",
    website: "luminsolarleads.com",
    location: "Phoenix, AZ",
    icpType: "High-Volume Appointment Setting Agency",
    sendingVolume: "250,000 emails/mo",
    sendingPlatform: "Smartlead",
    currentInfrastructure: "Cheap burner domains from Namecheap",
    specificInfrastructureFriction: "Burning 30+ domains every month because registrars flag bulk WHOIS without proper warming ramp",
    customFields: {
      domains_burned_monthly: "35 domains",
      warmup_churn: "Domains dying within 14 days",
      bottleneck: "Unmonitored domain burn halting appointment booking for regional installers",
    },
  },
  {
    id: "lk-6",
    firstName: "Graham",
    lastName: "Holt",
    email: "graham@ironwoodcre.com",
    company: "Ironwood Commercial Realty",
    jobTitle: "Partner & Head of Acquisitions",
    industry: "Commercial Real Estate & Private Equity",
    website: "ironwoodcre.com",
    location: "Atlanta, GA",
    icpType: "Commercial Real Estate Deal Sourcing",
    sendingVolume: "18,000 emails/mo",
    sendingPlatform: "Instantly",
    currentInfrastructure: "Google Workspace single admin account",
    specificInfrastructureFriction: "Google Workspace suspended 3 acquisition specialist accounts for rapid cold messaging off-market property owners",
    customFields: {
      deal_size: "$2M-$15M",
      account_status: "Google Workspace policy warnings",
      bottleneck: "Suspended Google accounts halting off-market property owner outreach",
    },
  },
  {
    id: "lk-7",
    firstName: "Zoe",
    lastName: "Kaufman",
    email: "zoe@pipelinecrafted.com",
    company: "PipelineCrafted",
    jobTitle: "Fractional CMO & Founder",
    industry: "B2B Demand Gen & GTM Advisory",
    website: "pipelinecrafted.com",
    location: "Boulder, CO",
    icpType: "Fractional CMO / GTM Consultant",
    sendingVolume: "40,000 emails/mo across 6 clients",
    sendingPlatform: "Smartlead",
    currentInfrastructure: "Clients set up their own secondary domains",
    specificInfrastructureFriction: "Client internal IT teams taking 3 to 4 weeks to grant DNS access and generate SPF/DMARC records",
    customFields: {
      onboarding_lag: "24 days average",
      client_friction: "Internal IT departments refuse to create secondary domain records",
      bottleneck: "Campaign launches delayed by weeks waiting for client IT approvals",
    },
  },
  {
    id: "lk-8",
    firstName: "Liam",
    lastName: "Fletcher",
    email: "liam@shieldcybermsp.com",
    company: "Shield Cybersecurity & MSP",
    jobTitle: "VP of Business Development",
    industry: "Managed IT & Cybersecurity Services",
    website: "shieldcybermsp.com",
    location: "Charlotte, NC",
    icpType: "Regional Managed IT / Cybersecurity Provider",
    sendingVolume: "20,000 emails/mo",
    sendingPlatform: "Instantly",
    currentInfrastructure: "Primary company domain on Microsoft 365",
    specificInfrastructureFriction: "Prospecting emails to regional healthcare clinics getting quarantined by Proofpoint",
    customFields: {
      target_clients: "Regional healthcare & law practices",
      quarantine_rate: "34%",
      bottleneck: "Primary domain flagged in Proofpoint spam quarantine",
    },
  },
  {
    id: "lk-9",
    firstName: "Ananya",
    lastName: "Deshmukh",
    email: "ananya@fintechsummitglobal.com",
    company: "FinTech World Summits",
    jobTitle: "VP of Delegate & Sponsor Relations",
    industry: "B2B Executive Conferences & Media",
    website: "fintechsummitglobal.com",
    location: "London, UK",
    icpType: "B2B Conference & Sponsorship Sales Team",
    sendingVolume: "80,000 emails/mo",
    sendingPlatform: "Lemlist",
    currentInfrastructure: "Single dedicated IP on SendGrid + Google Workspace",
    specificInfrastructureFriction: "Conference invitation emails to tier-1 banking executives landing in spam due to lack of inbox rotation",
    customFields: {
      ticket_price: "$1,800 - $12,000 sponsorship",
      open_rate: "14%",
      bottleneck: "High-volume invitation bursts without inbox rotation burning domain reputation",
    },
  },
  {
    id: "lk-10",
    firstName: "Julian",
    lastName: "St. Clair",
    email: "julian@vanguardcapadvisors.com",
    company: "Vanguard Capital Advisory",
    jobTitle: "Managing Partner",
    industry: "Boutique M&A & Private Equity Advisory",
    website: "vanguardcapadvisors.com",
    location: "Boston, MA",
    icpType: "Lower Middle Market M&A Intermediary",
    sendingVolume: "12,000 emails/mo",
    sendingPlatform: "Outlook 365",
    currentInfrastructure: "Sending directly from corporate vanguardcapadvisors.com",
    specificInfrastructureFriction: "Founder outreach for private company buyouts accidentally causing primary corporate email to get flagged by Spamhaus",
    customFields: {
      deal_value: "$10M - $50M EV",
      risk_event: "Spamhaus listing risk on corporate dealmaker domain",
      bottleneck: "Private equity outreach exposing corporate transactional domain to blacklist",
    },
  },
];

function fleschKincaidGrade(text: string): number {
  const sentences = Math.max(1, text.trim().split(/[.!?]+/).filter(Boolean).length);
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  if (words.length === 0) return 0;
  let syllables = 0;
  for (const w of words) {
    const lower = w.toLowerCase();
    const count = (lower.match(/[aeiouy]+/g) || []).length;
    let syl = count;
    if (lower.endsWith("e") && !lower.endsWith("le") && count > 1) {
      syl -= 1;
    }
    syllables += Math.max(1, syl);
  }
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(Math.max(0, grade) * 10) / 10;
}

export async function runLeadsKingdomDemo() {
  console.log("================================================================================");
  console.log("LEADSKINGDOM.CO — TOP 0.001% COLD EMAIL INFRASTRUCTURE CAMPAIGN (10 ICP LEADS)");
  console.log("Company Pitching: LeadsKingdom (Cold Email Automation & Mailbox Infrastructure)");
  console.log("Target Audience: 10 Distinct ICP Segments (Agencies, SaaS, Recruiters, CRE, M&A)");
  console.log("Framework: Round 5 Zero-Pitch-Slap, 35-55 words, Grade 5-7, Micro-Permission CTA");
  console.log("================================================================================\n");

  const results: any[] = [];

  for (let i = 0; i < LEADS_KINGDOM_10_LEADS.length; i++) {
    const lead = LEADS_KINGDOM_10_LEADS[i];
    const instruction = `Provider: LeadsKingdom (leadskingdom.co).
Core Offering: Automated cold email infrastructure, pre-warmed secondary domains, Google Workspace & Microsoft 365 mailbox provisioning with automated SPF/DKIM/DMARC setup, rotating IP pools, and zero setup fees.
Value Proposition: Protect primary root domains from blacklists, eliminate 15 hours/week of manual DNS setup, reduce mailbox seat costs by 80%, and push open rates above 80% without burning domains.
Lead ICP: ${lead.icpType}
Current Setup: ${lead.currentInfrastructure} using ${lead.sendingPlatform} (${lead.sendingVolume})
Friction Point: ${lead.specificInfrastructureFriction}
Signal Data: ${JSON.stringify(lead.customFields)}`;

    const script = await generateEmailScriptOnTheFly({
      lead,
      customInstruction: instruction,
      senderName: "Arthur",
      fallbackSubject: "inbox deliverability",
      index: i,
    });

    const wordCount = script.bodyText.trim().split(/\s+/).length;
    const grade = fleschKincaidGrade(script.bodyText);

    // Follow-ups (Touch 2: 60s teardown, Touch 3: 9-word permission breakup)
    const step2Subject = `re: ${script.subject}`;
    const step2Body = `Hi ${lead.firstName},\n\nRecorded a 60-second video for ${lead.company} breaking down how peer teams isolate secondary mailboxes without losing domain reputation.\n\nWould you prefer I share the link here, or is there a better email for you?\n\nBest,\nArthur`;
    const step2Words = step2Body.trim().split(/\s+/).length;

    const step3Subject = `re: ${script.subject}`;
    const step3Body = `Hi ${lead.firstName},\n\nAssuming you're heads-down right now and cold email deliverability isn't a priority.\n\nShould I close your file for now, or check back with you in Q3?\n\nBest,\nArthur`;
    const step3Words = step3Body.trim().split(/\s+/).length;

    results.push({
      leadNumber: i + 1,
      leadName: `${lead.firstName} ${lead.lastName}`,
      leadCompany: lead.company,
      leadTitle: lead.jobTitle,
      leadIndustry: lead.industry,
      icpType: lead.icpType,
      currentInfrastructure: lead.currentInfrastructure,
      sendingPlatform: lead.sendingPlatform,
      sendingVolume: lead.sendingVolume,
      frictionSignal: lead.specificInfrastructureFriction,
      subject: script.subject,
      body: script.bodyText,
      wordCount,
      readingGrade: grade,
      step2Subject,
      step2Body,
      step2Words,
      step3Subject,
      step3Body,
      step3Words,
      reason: script.personalizationReason,
    });
  }

  return results;
}

if (process.argv[1]?.includes("test-10-leads-leadskingdom")) {
  runLeadsKingdomDemo()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch(console.error);
}
