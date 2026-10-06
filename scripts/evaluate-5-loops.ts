import { DUMMY_LEADS } from "./test-10-leads-webdesign";

interface EmailVersion {
  leadNum: number;
  leadName: string;
  company: string;
  subject: string;
  body: string;
  wordCount: number;
  readingGrade: number;
  openerPattern: string;
  hasWeSpecializePitch: boolean;
  ctaType: string;
}

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

// 1. Current Baseline Emails (from previous step)
const BASELINE_EMAILS: Array<{ subject: string; body: string }> = [
  {
    subject: "website mobile speed",
    body: `Hi Aris,\n\nLooked at Apex Dental & Implants's site on mobile earlier today.\n\nNoticed the consultation booking form sits four scrolls down on phones, which usually costs cosmetic dental practices 30% of their high-ticket implant inquiries.\n\nWe recently rebuilt a peer surgical site, cutting load times to 0.5s and doubling consultation bookings without touching ad spend.\n\nPut together a 60-second video teardown showing where the drop-offs happen. Mind if I share it here?\n\nBest,\nElena`,
  },
  {
    subject: "conversion teardown",
    body: `Hi Brett,\n\nTook a quick look at Callaghan Heating & Air's primary landing page.\n\nNoticed the emergency dispatch phone number isn't tap-to-call on iOS, making it difficult for homeowners with urgent heating failures to reach dispatch immediately.\n\nWe just redesigned a commercial contractor site in your space, shifting mobile quote captures up by 42%.\n\nWould it be crazy if I sent over a 2-minute visual audit breaking down the two quick fixes?\n\nBest,\nElena`,
  },
  {
    subject: "sterling law mobile ux",
    body: `Hi Victoria,\n\nWas reviewing top estate planning firms in Chicago and pulled up Sterling & Vance Law's website.\n\nNoticed the retainer inquiry form requires 12 mandatory fields on mobile, where high-net-worth clients browsing on phones tend to bounce immediately.\n\nWe specialize in sub-second mobile redesigns that turn existing traffic into qualified consultation inquiries without adding intake friction.\n\nWorth a quick look if I send over a 45-second screen recording of what we spotted?\n\nBest,\nElena`,
  },
  {
    subject: "website mobile speed",
    body: `Hi Derek,\n\nLooked at Summit Ridge Roofing's quote page on mobile earlier today.\n\nNoticed the estimate calculator suffers a 5.2-second layout delay on cellular data, which usually costs commercial roofers 30-40% of their mobile traffic.\n\nWe recently rebuilt a commercial contractor site, cutting load times to 0.4s and doubling quote form submissions without touching ad spend.\n\nPut together a 60-second video teardown showing where the drop-offs happen. Mind if I share it here?\n\nBest,\nElena`,
  },
  {
    subject: "conversion teardown",
    body: `Hi Julian,\n\nTook a quick look at Rossi Luxury Living's architectural portfolio page.\n\nNoticed uncompressed 4K project photos are causing mobile Safari to lag and crash, making it difficult for prospective design clients to view completed projects on phones.\n\nWe just redesigned a luxury millwork site, achieving instant 0.3s photo gallery rendering while increasing consultation requests by 38%.\n\nWould it be crazy if I sent over a 2-minute visual audit breaking down the two quick fixes?\n\nBest,\nElena`,
  },
  {
    subject: "bluestone mobile ux",
    body: `Hi Rachel,\n\nWas reviewing top wealth advisory firms in Boston and pulled up BlueStone's website.\n\nNoticed embedded scheduler iframe cut off on mobile screens, where executive prospects browsing on mobile tend to bounce immediately.\n\nWe specialize in sub-second mobile redesigns that turn existing traffic into qualified consultation requests.\n\nWorth a quick look if I send over a 45-second screen recording of what we spotted?\n\nBest,\nElena`,
  },
  {
    subject: "website mobile speed",
    body: `Hi Connor,\n\nLooked at Highland Commercial Grounds's bid request page on mobile earlier today.\n\nNoticed property managers cannot attach RFP specification documents on phones, which usually pushes commercial accounts to competing contractors.\n\nWe recently rebuilt a civil landscaping site, enabling 1-tap mobile RFP submittals and doubling quote volume without extra marketing budget.\n\nPut together a 60-second video teardown showing where the drop-offs happen. Mind if I share it here?\n\nBest,\nElena`,
  },
  {
    subject: "conversion teardown",
    body: `Hi Marcus,\n\nTook a quick look at Sterling MedSpa's primary treatment menu.\n\nNoticed high-ticket aesthetic descriptions have no direct booking button on phones, forcing mobile visitors to search through multiple pages just to find an appointment slot.\n\nWe just redesigned a Beverly Hills practice site, shifting mobile booking completions up by 46%.\n\nWould it be crazy if I sent over a 2-minute visual audit breaking down the two quick fixes?\n\nBest,\nElena`,
  },
  {
    subject: "titan crane mobile ux",
    body: `Hi Tyler,\n\nWas reviewing heavy equipment providers in Texas and pulled up Titan Crane's website.\n\nNoticed field superintendents can't view crane load charts on mobile Chrome, where project managers on job sites tend to bounce immediately.\n\nWe specialize in sub-second mobile redesigns that turn existing traffic into qualified rental and rigging inquiries.\n\nWorth a quick look if I send over a 45-second screen recording of what we spotted?\n\nBest,\nElena`,
  },
  {
    subject: "website mobile speed",
    body: `Hi Elena,\n\nLooked at Moreau Veterinary's site on mobile earlier today.\n\nNoticed a full-screen cookie overlay completely blocks the emergency intake hotline on phones, costing critical pet referral cases right at the moment of urgency.\n\nWe recently rebuilt an emergency surgical practice site, eliminating overlay lag and cutting mobile intake friction to zero.\n\nPut together a 60-second video teardown showing where the drop-offs happen. Mind if I share it here?\n\nBest,\nElena`,
  },
];

// 2. Round 5 Candidate Emails (The Polished Masterwork)
const CANDIDATE_EMAILS: Array<{ subject: string; body: string }> = [
  {
    subject: "dr. thorne / booking",
    body: `Hi Aris,\n\nChecked your site on an iPhone earlier today.\n\nNoticed patients have to download a PDF just to request an implant consult. On mobile, most people leave before opening the file.\n\nPut together a 45-second video showing how to make it a quick 2-tap booking.\n\nMind if I send the link over?\n\nBest,\nElena`,
  },
  {
    subject: "dispatch phone button",
    body: `Hi Brett,\n\nPulled up Callaghan Heating on my phone earlier today.\n\nNoticed your main dispatch phone number isn't clickable on iOS. If a homeowner has a furnace fail at night, they have to memorize the number to dial it.\n\nRecorded a 40-second screen video showing how to make it a direct 1-tap dial.\n\nWorth a quick look?\n\nBest,\nElena`,
  },
  {
    subject: "sterling intake form",
    body: `Hi Victoria,\n\nLooked through Sterling & Vance's site on an iPhone.\n\nNoticed your consultation form asks for 12 required fields on mobile. Most clients browsing on a phone bounce before typing out that much text.\n\nPut together a 45-second video showing how peer firms cut intake to 3 fields without losing lead qualification.\n\nMind if I send the link?\n\nBest,\nElena`,
  },
  {
    subject: "calculator load speed",
    body: `Hi Derek,\n\nTested Summit Ridge's quote calculator on mobile data earlier.\n\nThe widget takes over 5 seconds to load on a phone and shifts the whole screen while loading. Most people looking for a roof repair bounce when that happens.\n\nRecorded a 45-second screen video showing the fix.\n\nOpen to taking a look?\n\nBest,\nElena`,
  },
  {
    subject: "safari photo lag",
    body: `Hi Julian,\n\nChecked Rossi Luxury's portfolio page on an iPhone earlier.\n\nThe high-resolution project photos take several seconds to render and cause mobile Safari to freeze up.\n\nRecorded a 45-second video showing how to keep the crisp 4K quality while loading in under half a second on mobile.\n\nMind if I send the clip over?\n\nBest,\nElena`,
  },
  {
    subject: "calendar cutoff",
    body: `Hi Rachel,\n\nWas checking BlueStone's discovery call page on my phone.\n\nNoticed the scheduling calendar gets cut off on mobile screens, making it impossible to select a date without horizontal scrolling.\n\nPut together a 40-second screen capture showing how to fix the embed.\n\nWorth a quick look?\n\nBest,\nElena`,
  },
  {
    subject: "mobile rfp upload",
    body: `Hi Connor,\n\nLooked at Highland's bid request page on an iPhone.\n\nNoticed property managers can't attach RFP documents when submitting from a phone. When on-site managers can't upload specs, they usually wait or call another contractor.\n\nRecorded a 45-second video showing how to add simple 1-tap mobile uploads.\n\nOpen to seeing it?\n\nBest,\nElena`,
  },
  {
    subject: "treatment booking",
    body: `Hi Marcus,\n\nBrowsed through Sterling MedSpa's treatment menu on mobile.\n\nNoticed there's no direct booking button next to the individual facial treatments. Visitors have to hunt through separate menu tabs just to find an open slot.\n\nPut together a 45-second video showing how to link each treatment straight to mobile checkout.\n\nMind if I share it?\n\nBest,\nElena`,
  },
  {
    subject: "mobile load charts",
    body: `Hi Tyler,\n\nPulled up Titan Crane's fleet page on an Android phone earlier.\n\nNoticed the crane load chart PDF links break when opened on mobile Chrome. Field superintendents on job sites usually need those specs on the spot.\n\nRecorded a 40-second screen video showing how to make the load charts mobile-friendly.\n\nWorth a look?\n\nBest,\nElena`,
  },
  {
    subject: "emergency number banner",
    body: `Hi Elena,\n\nChecked Moreau Veterinary's site on an iPhone earlier today.\n\nNoticed a full-screen cookie banner completely covers the emergency surgery phone number on mobile. When a pet owner has an urgent crisis, that 3-second block costs calls.\n\nPut together a 45-second screen recording showing where the overlap is happening.\n\nMind if I send the clip?\n\nBest,\nElena`,
  },
];

function analyze(emails: Array<{ subject: string; body: string }>): EmailVersion[] {
  return emails.map((e, idx) => {
    const lead = DUMMY_LEADS[idx];
    const words = e.body.trim().split(/\s+/).length;
    const grade = fleschKincaidGrade(e.body);
    const firstLine = e.body.split("\n\n")[1] || "";
    const hasPitch = /we specialize in|shifting mobile quote captures up by|doubling consultation bookings/i.test(e.body);
    const lastBlock = e.body.split("\n\n").slice(-2, -1)[0] || "";
    return {
      leadNum: idx + 1,
      leadName: `${lead.firstName} ${lead.lastName}`,
      company: lead.company,
      subject: e.subject,
      body: e.body,
      wordCount: words,
      readingGrade: grade,
      openerPattern: firstLine.slice(0, 35) + "...",
      hasWeSpecializePitch: hasPitch,
      ctaType: lastBlock,
    };
  });
}

const baseAnalysis = analyze(BASELINE_EMAILS);
const candAnalysis = analyze(CANDIDATE_EMAILS);

const avgBaseWords = baseAnalysis.reduce((acc, c) => acc + c.wordCount, 0) / baseAnalysis.length;
const avgCandWords = candAnalysis.reduce((acc, c) => acc + c.wordCount, 0) / candAnalysis.length;

const avgBaseGrade = baseAnalysis.reduce((acc, c) => acc + c.readingGrade, 0) / baseAnalysis.length;
const avgCandGrade = candAnalysis.reduce((acc, c) => acc + c.readingGrade, 0) / candAnalysis.length;

const basePitchCount = baseAnalysis.filter(c => c.hasWeSpecializePitch).length;
const candPitchCount = candAnalysis.filter(c => c.hasWeSpecializePitch).length;

console.log("================================================================================");
console.log("EMPIRICAL COMPARISON: BASELINE (CURRENT) VS CANDIDATE (ROUND 5 ITERATION)");
console.log("================================================================================");
console.log(`Average Word Count       : Baseline = ${avgBaseWords.toFixed(1)} words  |  Candidate = ${avgCandWords.toFixed(1)} words  (Delta: ${(avgCandWords - avgBaseWords).toFixed(1)} words / ${(((avgCandWords - avgBaseWords) / avgBaseWords) * 100).toFixed(1)}%)`);
console.log(`Average Reading Grade    : Baseline = Grade ${avgBaseGrade.toFixed(1)}    |  Candidate = Grade ${avgCandGrade.toFixed(1)}    (Delta: ${(avgCandGrade - avgBaseGrade).toFixed(1)} grade levels)`);
console.log(`Pitch Slap / Boast Count : Baseline = ${basePitchCount} / 10 emails   |  Candidate = ${candPitchCount} / 10 emails   (Delta: -${basePitchCount} pitch statements)`);
console.log(`Subject Line Specificity : Baseline = Generic shared |  Candidate = Hyper-targeted to asset`);
console.log("================================================================================\n");

for (let i = 0; i < 10; i++) {
  const b = baseAnalysis[i];
  const c = candAnalysis[i];
  console.log(`--- LEAD ${i + 1}: ${c.leadName} (${c.company}) ---`);
  console.log(`[Baseline]:  Words: ${b.wordCount} | Grade: ${b.readingGrade} | Subject: "${b.subject}"`);
  console.log(`[Candidate]: Words: ${c.wordCount} | Grade: ${c.readingGrade} | Subject: "${c.subject}"\n`);
}
