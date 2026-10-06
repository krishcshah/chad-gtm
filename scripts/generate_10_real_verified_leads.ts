import { generateEmailScriptOnTheFly, type LeadProfile } from "../packages/email-engine/src/ai.ts";

export interface RealCompanyAuditLead extends LeadProfile {
  realCompanyWebsite: string;
  mailProvider: string;
  spfStatus: string;
  dmarcStatus: string;
  verifiableDnsCheck: string;
  infrastructurePain: string;
}

export const REAL_10_LEADS: RealCompanyAuditLead[] = [
  {
    id: "real-1",
    firstName: "Paul",
    lastName: "Backalenick",
    email: "pbackalenick@nexxite.com",
    company: "Nexxite",
    jobTitle: "President",
    industry: "Information Technology & Services",
    website: "nexxite.com",
    location: "United States",
    realCompanyWebsite: "https://nexxite.com",
    mailProvider: "Microsoft 365",
    spfStatus: "v=spf1 configured",
    dmarcStatus: "MISSING (NXDOMAIN on _dmarc.nexxite.com)",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.nexxite.com",
    infrastructurePain: "Missing DMARC record causes Google and Yahoo 2024 bulk filters to reject or spam cold outreach sent from nexxite.com",
    customFields: {
      provider: "Microsoft 365",
      dmarc: "Missing",
      bottleneck: "Missing DMARC record causing Yahoo and Google spam rejections on corporate domain",
    },
  },
  {
    id: "real-2",
    firstName: "Scott",
    lastName: "Rehkop",
    email: "scott@synergystaffingkc.com",
    company: "Synergy Staffing",
    jobTitle: "Owner",
    industry: "Staffing & Recruiting",
    website: "synergystaffingkc.com",
    location: "Kansas City, MO",
    realCompanyWebsite: "http://synergystaffingkc.com",
    mailProvider: "Microsoft 365",
    spfStatus: "v=spf1 include:spf.protection.outlook.com -all",
    dmarcStatus: "MISSING (No DMARC TXT record on Worldnic DNS)",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.synergystaffingkc.com",
    infrastructurePain: "Recruiters sending candidate headhunt reach-outs from unauthenticated Microsoft 365 domain risk getting primary recruiting emails routed to junk",
    customFields: {
      provider: "Microsoft 365",
      dmarc: "Missing",
      bottleneck: "Candidate reach-outs hitting Microsoft 365 tenant sending caps without DMARC",
    },
  },
  {
    id: "real-3",
    firstName: "Tiffany",
    lastName: "Gonzalez",
    email: "tiffany@accountingtoscale.com",
    company: "Accounting To Scale",
    jobTitle: "CEO & Founder",
    industry: "Accounting & Financial Services",
    website: "accountingtoscale.com",
    location: "Miami, FL",
    realCompanyWebsite: "https://accountingtoscale.com",
    mailProvider: "Google Workspace",
    spfStatus: "v=spf1 include:_spf.google.com ~all",
    dmarcStatus: "p=none (unprotected monitoring policy)",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.accountingtoscale.com",
    infrastructurePain: "Prospecting new clients directly from primary Google Workspace account burns root domain reputation and risks Google Workspace suspensions",
    customFields: {
      provider: "Google Workspace",
      dmarc: "p=none",
      primary_domain_risk: "Sending high volume from primary domain risks Google Workspace account suspension",
    },
  },
  {
    id: "real-4",
    firstName: "Lisa",
    lastName: "Girton",
    email: "lisa@theproductiveassistant.com",
    company: "The Productive Assistant",
    jobTitle: "Owner",
    industry: "Marketing & Virtual Assistant Services",
    website: "theproductiveassistant.com",
    location: "United States",
    realCompanyWebsite: "http://theproductiveassistant.com",
    mailProvider: "Barracuda Networks / Shared Relay",
    spfStatus: "v=spf1 include:spf.ess.barracudanetworks.com",
    dmarcStatus: "p=quarantine",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.theproductiveassistant.com",
    infrastructurePain: "Aggressive DMARC quarantine on primary domain combined with external relays causes high-volume agency prospecting to get filtered into quarantine folders",
    customFields: {
      provider: "Barracuda Relay",
      dmarc: "p=quarantine",
      bottleneck: "Grows via client referrals; zero cold acquisition infrastructure",
    },
  },
  {
    id: "real-5",
    firstName: "Michelle",
    lastName: "Galligan",
    email: "mgalligan@keepfinancials.com",
    company: "Keep Financials",
    jobTitle: "Co-Founder & Managing Director",
    industry: "Financial & Advisory Services",
    website: "keepfinancials.com",
    location: "Chicago, IL",
    realCompanyWebsite: "https://keepfinancials.com",
    mailProvider: "Google Workspace",
    spfStatus: "BROKEN / MISSING (Contains raw 'spf.bullhornmail.com' without valid v=spf1 prefix)",
    dmarcStatus: "MISSING (No DMARC record found)",
    verifiableDnsCheck: "nslookup -type=txt keepfinancials.com",
    infrastructurePain: "Malformed SPF syntax and zero DMARC record guarantees that cold emails to corporate controllers and CFOs fail authentication checks",
    customFields: {
      provider: "Google Workspace",
      spf: "Broken Syntax",
      bottleneck: "Missing DMARC and broken SPF signatures failing enterprise spam filters",
    },
  },
  {
    id: "real-6",
    firstName: "Brooke",
    lastName: "Stone",
    email: "brooke@gystplease.com",
    company: "GYST",
    jobTitle: "Founder & CEO",
    industry: "Staffing & Executive Support",
    website: "gystplease.com",
    location: "New York, NY",
    realCompanyWebsite: "http://gystplease.com",
    mailProvider: "Google Workspace",
    spfStatus: "v=spf1 include:mg-spf.greenhouse.io ~all",
    dmarcStatus: "MISSING (No DMARC record found)",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.gystplease.com",
    infrastructurePain: "Sending high-volume outbound from root domain without DMARC exposes primary recruiting domain to reputation degradation and bounce spikes",
    customFields: {
      provider: "Google Workspace",
      dmarc: "Missing",
      bottleneck: "Missing DMARC record on primary recruiting domain",
    },
  },
  {
    id: "real-7",
    firstName: "Nav",
    lastName: "Sandhu",
    email: "nav.sandhu@terafyle.com",
    company: "SaaS Direct",
    jobTitle: "Founder & CEO",
    industry: "Computer Software & ERP Consulting",
    website: "saasdirect.co",
    location: "Canada / US",
    realCompanyWebsite: "http://saasdirect.co",
    mailProvider: "Google Workspace",
    spfStatus: "v=spf1 include:_spf.google.com ~all",
    dmarcStatus: "p=none",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.saasdirect.co",
    infrastructurePain: "Paying Google Workspace full seat pricing for secondary sales reps while risking corporate ERP consulting domain on cold outbound",
    customFields: {
      provider: "Google Workspace",
      dmarc: "p=none",
      active_outbound: true,
      bottleneck: "Paying Google Workspace seat fees on active prospecting accounts",
    },
  },
  {
    id: "real-8",
    firstName: "Russell",
    lastName: "Munz",
    email: "rmunz@communityfinancials.com",
    company: "Community Financials",
    jobTitle: "President",
    industry: "Accounting & HOA Management",
    website: "communityfinancials.com",
    location: "United States",
    realCompanyWebsite: "https://communityfinancials.com",
    mailProvider: "Google Workspace",
    spfStatus: "v=spf1 include:_spf.google.com ~all",
    dmarcStatus: "p=quarantine",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.communityfinancials.com",
    infrastructurePain: "Boutique accounting and HOA management practice growing through word-of-mouth without dedicated outbound acquisition",
    customFields: {
      provider: "Google Workspace",
      dmarc: "p=quarantine",
      bottleneck: "Relies on property manager referrals; no cold outreach engine",
    },
  },
  {
    id: "real-9",
    firstName: "Sam",
    lastName: "White",
    email: "swhite@mybugmaster.com",
    company: "Bugmaster Pest Control",
    jobTitle: "President",
    industry: "Commercial Pest Control Services",
    website: "mybugmaster.com",
    location: "United States",
    realCompanyWebsite: "https://mybugmaster.com",
    mailProvider: "Microsoft 365",
    spfStatus: "v=spf1 include:spf.protection.outlook.com -all",
    dmarcStatus: "MISSING (No DMARC record on mybugmaster.com)",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.mybugmaster.com",
    infrastructurePain: "Missing DMARC record causes Google and Yahoo bulk filters to block facility outreach",
    customFields: {
      provider: "Microsoft 365",
      dmarc: "Missing",
      bottleneck: "Missing DMARC record on mybugmaster.com",
    },
  },
  {
    id: "real-10",
    firstName: "Ken",
    lastName: "Lewellyn",
    email: "klewellyn@tnbizserv.com",
    company: "Tennessee Business Services",
    jobTitle: "Vice President",
    industry: "Business Consulting & Corporate Records",
    website: "tnbizserv.com",
    location: "Nashville, TN",
    realCompanyWebsite: "http://tnbizserv.com",
    mailProvider: "Independent Relay",
    spfStatus: "v=spf1 a mx include:relay.dnsexit.com ~all",
    dmarcStatus: "p=quarantine",
    verifiableDnsCheck: "nslookup -type=txt _dmarc.tnbizserv.com",
    infrastructurePain: "Boutique registered agent and corporate filings practice relying on local inbound and referrals",
    customFields: {
      provider: "DNSExit Relay",
      dmarc: "p=quarantine",
      bottleneck: "Grows via local corporate filings and word-of-mouth; lacks outbound client engine",
    },
  },
];

import {
  generateEmailScriptOnTheFly,
  investigateLeadDossier,
  type LeadProfile,
  type LeadResearchDossier,
} from "../packages/email-engine/src/ai.ts";

export async function runRealLeadsDemo() {
  const results: any[] = [];

  for (let i = 0; i < REAL_10_LEADS.length; i++) {
    const lead = REAL_10_LEADS[i];
    const instruction = `Provider: LeadsKingdom (leadskingdom.co).
Core Offering: Managed cold email infrastructure, pre-warmed secondary domains, automated SPF/DKIM/DMARC setup, rotating IP pools, and turnkey outbound launch.
Pitch Angle: If the lead is an Outbound Newbie (relying on referrals/ads), pitch turnkey cold client acquisition setup from scratch without ad spend. If they have a verified DNS defect, offer a 40-second screencap showing the fix. If they are actively doing outbound, pitch cutting $7/user seat costs by 80%.`;

    const dossier = await investigateLeadDossier(lead, instruction);

    const script = await generateEmailScriptOnTheFly({
      lead,
      dossier,
      customInstruction: instruction,
      senderName: "Arthur",
      fallbackSubject: dossier.suggestedSubject,
      index: i,
    });

    const wordCount = script.bodyText.trim().split(/\s+/).length;

    // Follow-ups tailored to maturity
    const step2Subject = `re: ${script.subject}`;
    const step2Body =
      dossier.outboundMaturity === "OUTBOUND_NEWBIE"
        ? `Hi ${lead.firstName},\n\nRecorded a 60-second video showing how peer ${lead.company.toLowerCase().includes("accounting") ? "accounting" : lead.company.toLowerCase().includes("staffing") ? "staffing" : "firms"} book 5 to 10 qualified client calls a month without paying for ads.\n\nWould you prefer I share the link here, or is there a better email for you?\n\nBest,\nArthur`
        : `Hi ${lead.firstName},\n\nRecorded a 60-second video for ${lead.company} breaking down how peer teams isolate secondary mailboxes without losing domain reputation.\n\nWould you prefer I share the link here, or is there a better email for you?\n\nBest,\nArthur`;
    const step2Words = step2Body.trim().split(/\s+/).length;

    const step3Subject = `re: ${script.subject}`;
    const step3Body =
      dossier.outboundMaturity === "OUTBOUND_NEWBIE"
        ? `Hi ${lead.firstName},\n\nAssuming you're at full capacity right now and client acquisition isn't a priority for ${lead.company}.\n\nShould I close your file for now, or check back with you next quarter?\n\nBest,\nArthur`
        : `Hi ${lead.firstName},\n\nAssuming you're heads-down right now and cold email deliverability isn't a priority.\n\nShould I close your file for now, or check back with you in Q3?\n\nBest,\nArthur`;
    const step3Words = step3Body.trim().split(/\s+/).length;

    results.push({
      leadNumber: i + 1,
      name: `${lead.firstName} ${lead.lastName}`,
      title: lead.jobTitle,
      company: lead.company,
      location: lead.location,
      domain: lead.website,
      verifiableDnsCheck: lead.verifiableDnsCheck,
      verifiedDnsStatus: {
        provider: lead.mailProvider,
        spf: lead.spfStatus,
        dmarc: lead.dmarcStatus,
      },
      investigationDossier: {
        category: dossier.industryCategory,
        businessSummary: dossier.businessSummary,
        outboundMaturity: dossier.outboundMaturity,
        maturityRationale: dossier.maturityRationale,
        recommendedAngle: dossier.recommendedAngle,
        humanObservation: dossier.humanObservation,
        frictionPoke: dossier.frictionPoke,
        customAsset: dossier.customAssetDeliverable,
      },
      emailTouch1: {
        subject: script.subject,
        body: script.bodyText,
        wordCount,
      },
      emailTouch2: {
        subject: step2Subject,
        body: step2Body,
        wordCount: step2Words,
      },
      emailTouch3: {
        subject: step3Subject,
        body: step3Body,
        wordCount: step3Words,
      },
      personalizationReason: script.personalizationReason,
    });
  }

  return results;
}

if (process.argv[1]?.includes("generate_10_real_verified_leads")) {
  runRealLeadsDemo()
    .then((res) => {
      const fs = require("fs");
      fs.writeFileSync("scripts/real_leads_output.json", JSON.stringify(res, null, 2));
      console.log(`Generated ${res.length} audited leads successfully. Written to scripts/real_leads_output.json.`);
    })
    .catch(console.error);
}
