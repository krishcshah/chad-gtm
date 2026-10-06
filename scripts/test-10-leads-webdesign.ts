import { generateEmailScriptOnTheFly, type LeadProfile } from "../packages/email-engine/src/ai.ts";

export interface LocalLeadTest extends LeadProfile {
  specificAssetTrigger: string;
  niche: string;
}

export const DUMMY_LEADS: LocalLeadTest[] = [
  {
    id: "lead-1",
    firstName: "Aris",
    lastName: "Thorne",
    email: "dr.thorne@apexdentalimplants.com",
    company: "Apex Dental & Implants",
    jobTitle: "Founder & Lead Implant Surgeon",
    industry: "Cosmetic & Implant Dentistry",
    website: "apexdentalimplants.com",
    location: "Austin, TX",
    niche: "High-ticket dental implants ($15k-$40k cases)",
    specificAssetTrigger: "Mobile consultation booking form sits 4 scrolls down on phone",
    customFields: {
      avg_case_value: "$28,000",
      mobile_speed_score: "38/100",
      booking_friction: "Requires downloading a PDF intake form",
    },
  },
  {
    id: "lead-2",
    firstName: "Brett",
    lastName: "Callaghan",
    email: "brett@callaghanhvac.com",
    company: "Callaghan Heating & Air",
    jobTitle: "Owner & General Manager",
    industry: "HVAC & Mechanical Services",
    website: "callaghanhvac.com",
    location: "Denver, CO",
    niche: "Commercial & residential HVAC installations",
    specificAssetTrigger: "Emergency dispatch phone number is not tap-to-call on iOS",
    customFields: {
      crew_size: "18 technicians",
      mobile_speed_score: "42/100",
      booking_friction: "Broken tap-to-call button on mobile hero",
    },
  },
  {
    id: "lead-3",
    firstName: "Victoria",
    lastName: "Sterling",
    email: "vsterling@sterlinglawllp.com",
    company: "Sterling & Vance Law LLP",
    jobTitle: "Managing Partner",
    industry: "Estate Planning & Corporate Law",
    website: "sterlinglawllp.com",
    location: "Chicago, IL",
    niche: "High-net-worth estate planning & M&A litigation",
    specificAssetTrigger: "Retainer consultation form requires 12 mandatory fields",
    customFields: {
      avg_retainer: "$15,000",
      mobile_speed_score: "44/100",
      booking_friction: "12-field mandatory form causing 80% mobile bounce",
    },
  },
  {
    id: "lead-4",
    firstName: "Derek",
    lastName: "Miller",
    email: "derek@summitridgeroofing.com",
    company: "Summit Ridge Roofing",
    jobTitle: "Founder & CEO",
    industry: "Commercial & Luxury Roofing",
    website: "summitridgeroofing.com",
    location: "Phoenix, AZ",
    niche: "Commercial TPO & luxury tile roof replacements",
    specificAssetTrigger: "Estimate calculator lags 5.2 seconds on mobile cellular data",
    customFields: {
      avg_project: "$45,000",
      mobile_speed_score: "31/100",
      booking_friction: "5.2s layout shift while loading quote widget",
    },
  },
  {
    id: "lead-5",
    firstName: "Julian",
    lastName: "Rossi",
    email: "julian@rossikitchens.com",
    company: "Rossi Luxury Living",
    jobTitle: "Principal Architect & Founder",
    industry: "High-End Architectural Millwork",
    website: "rossikitchens.com",
    location: "Miami, FL",
    niche: "Custom Italian cabinetry & $100k+ renovations",
    specificAssetTrigger: "Heavy uncompressed 4K project photos crashing mobile Safari",
    customFields: {
      avg_renovation: "$120,000",
      mobile_speed_score: "29/100",
      booking_friction: "Uncompressed gallery files crashing mobile browsers",
    },
  },
  {
    id: "lead-6",
    firstName: "Rachel",
    lastName: "Adams",
    email: "rachel@bluestoneadvisory.com",
    company: "BlueStone Wealth & Tax",
    jobTitle: "Managing Director",
    industry: "Wealth Management & Tax Advisory",
    website: "bluestoneadvisory.com",
    location: "Boston, MA",
    niche: "HNW executive tax mitigation ($5M+ net worth)",
    specificAssetTrigger: "Discovery call calendar link opens broken iframe on phones",
    customFields: {
      aum: "$250M",
      mobile_speed_score: "49/100",
      booking_friction: "Embedded scheduler iframe cut off on mobile screens",
    },
  },
  {
    id: "lead-7",
    firstName: "Connor",
    lastName: "MacLeod",
    email: "connor@highlandcommercial.com",
    company: "Highland Commercial Grounds",
    jobTitle: "Founder & Chief Estimator",
    industry: "Commercial Landscaping & Civil Works",
    website: "highlandcommercial.com",
    location: "Seattle, WA",
    niche: "Corporate campus maintenance & civil hardscaping",
    specificAssetTrigger: "RFP / Bid request form has no mobile file attachment support",
    customFields: {
      avg_contract: "$80,000/yr",
      mobile_speed_score: "41/100",
      booking_friction: "Property managers unable to upload RFP docs on mobile",
    },
  },
  {
    id: "lead-8",
    firstName: "Marcus",
    lastName: "Sterling",
    email: "dr.sterling@sterlingaesthetics.com",
    company: "Sterling MedSpa & Aesthetics",
    jobTitle: "Medical Director & Co-Owner",
    industry: "Medical Aesthetics & Plastic Surgery",
    website: "sterlingaesthetics.com",
    location: "Beverly Hills, CA",
    niche: "Facial contouring, lasers & non-invasive aesthetics",
    specificAssetTrigger: "Treatment menu doesn't link directly to appointment booking",
    customFields: {
      avg_patient_ltv: "$4,500",
      mobile_speed_score: "36/100",
      booking_friction: "Treatment descriptions have no direct booking action",
    },
  },
  {
    id: "lead-9",
    firstName: "Tyler",
    lastName: "Vance",
    email: "tyler@titancrane.com",
    company: "Titan Crane & Rigging",
    jobTitle: "VP of Operations",
    industry: "Heavy Industrial Equipment & Rigging",
    website: "titancrane.com",
    location: "Dallas, TX",
    niche: "Mobile crane rental & heavy rigging for energy / construction",
    specificAssetTrigger: "Lift spec sheet PDF links broken on mobile Chrome",
    customFields: {
      fleet_size: "34 cranes",
      mobile_speed_score: "45/100",
      booking_friction: "Field superintendents can't view crane load charts on phones",
    },
  },
  {
    id: "lead-10",
    firstName: "Elena",
    lastName: "Moreau",
    email: "dr.moreau@moreauveterinary.com",
    company: "Moreau Veterinary Surgical Center",
    jobTitle: "Hospital Director & Chief Surgeon",
    industry: "Specialty Veterinary Medicine",
    website: "moreauveterinary.com",
    location: "Atlanta, GA",
    niche: "24/7 pet emergency surgery & specialist referrals",
    specificAssetTrigger: "Emergency intake phone button hidden behind a cookie banner popup",
    customFields: {
      case_volume: "40 surgeries/wk",
      mobile_speed_score: "39/100",
      booking_friction: "Full-screen cookie overlay blocks emergency intake hotline",
    },
  },
];

async function runDemo() {
  console.log("================================================================================");
  console.log("CHADGTM TOP 0.001% COLD EMAIL COPYWRITING ENGINE — 10 LEAD VERIFICATION RUN");
  console.log("Agency Profile: Apex Web Lab (Conversion Engineering & Sub-Second UX)");
  console.log("Target Audience: 10 High-Ticket Local Service Founders & Practice Owners");
  console.log("Rules Enforced: <65 words, 3rd-grade reading level, 1-3 word lowercase subjects,");
  console.log("                strict Anti-To-Do negative constraints, low-friction interest CTA");
  console.log("================================================================================\n");

  const results: any[] = [];

  for (let i = 0; i < DUMMY_LEADS.length; i++) {
    const lead = DUMMY_LEADS[i];
    const instruction = `Local Web Design & Conversion Agency: Apex Web Lab.
Offering: Sub-second mobile speed optimization and high-converting UX redesign.
Value Offer: We rebuild slow, clunky local business sites into sub-second, mobile-first booking engines that turn existing traffic into 2x more phone calls and booked estimate forms without buying more ads.
Angle: Mobile layout delay & conversion leak.
Specific Lead Context:
- Niche: ${lead.niche}
- Critical Mobile Friction: ${lead.specificAssetTrigger}
- Data Signal: ${JSON.stringify(lead.customFields)}
Call to Action: Mind if I share a 60-second video teardown showing where the drop-offs happen?`;

    const script = await generateEmailScriptOnTheFly({
      lead,
      customInstruction: instruction,
      senderName: "Elena",
      fallbackSubject: "website mobile speed",
      index: i,
    });

    const wordCount = script.bodyText.trim().split(/\s+/).length;

    // Generate follow-ups
    const step2Subject = `re: ${script.subject}`;
    const step2Body = `Hi ${lead.firstName},\n\nRecorded the 60-second teardown for ${lead.company} showing the two mobile form shifts that are likely leaking inquiries.\n\nWould you prefer I share the link here, or is there a better email for you?\n\nBest,\nElena`;
    const step2Words = step2Body.trim().split(/\s+/).length;

    const step3Subject = `re: ${script.subject}`;
    const step3Body = `Hi ${lead.firstName},\n\nAssuming you're heads-down right now and website conversion isn't a priority.\n\nShould I close your file for now, or check back with you in Q3?\n\nBest,\nElena`;
    const step3Words = step3Body.trim().split(/\s+/).length;

    results.push({
      leadNumber: i + 1,
      leadName: `${lead.firstName} ${lead.lastName}`,
      leadCompany: lead.company,
      leadTitle: lead.jobTitle,
      leadIndustry: lead.industry,
      frictionSignal: lead.specificAssetTrigger,
      subject: script.subject,
      body: script.bodyText,
      wordCount,
      step2Subject,
      step2Body,
      step2Words,
      step3Subject,
      step3Body,
      step3Words,
      reason: script.personalizationReason,
    });
  }

  // Output cleanly formatted JSON to file for presentation
  console.log(JSON.stringify(results, null, 2));
}

if (process.argv[1]?.includes("test-10-leads-webdesign")) {
  runDemo().catch(console.error);
}
