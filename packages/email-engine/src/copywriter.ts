/**
 * The cold-email copywriter.
 *
 * One lead gets three emails in one thread:
 *   1. outreach         day 0   a reason to write that is about THEM
 *   2. follow-up 1      day 2   one new, concrete angle
 *   3. follow-up 2      day 4   a short, gracious close with an easy answer
 *
 * Inputs are only what we can stand behind: the sender's own research (their
 * website: what the product does, proof), the lead's directory row, and
 * triggers read from the lead's company website (each quoted, see
 * company-research.ts). The model writes; a deterministic gate checks every
 * draft (length, links, placeholders, filler, hedging, invented numbers or
 * social proof), then a second model call reads it as the recipient and
 * blocks forced openers and unsupported claims. Each failure goes back to the
 * writer with the exact problems, up to three attempts.
 *
 * No I/O of its own: the model call is injected, so it is fully unit-tested.
 */
import type { CompanyResearch } from "./company-research";

export type Step = 1 | 2 | 3;

export interface SenderContext {
  companyName: string;
  /** What the sender's company does, one or two sentences. */
  companySummary?: string;
  offerTitle?: string;
  /** The outcome the offer creates for the buyer. */
  valueProposition?: string;
  angle?: string;
  /** Preferred call to action, if the user set one. */
  cta?: string;
  /** Problems buyers have. The email may NAME these. */
  painPoints?: string[];
  /** What the product actually does. The ONLY capabilities the email may claim. */
  capabilities?: string[];
  /** Claims the sender may make (from their own site). */
  proofPoints?: string[];
}

export interface Recipient {
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  industry?: string | null;
  location?: string | null;
}

/** One problem the buyer has, mapped to the capabilities that actually solve it. */
export interface Angle {
  pain: string;
  /** 1-based CAPABILITY numbers that directly fix this problem. */
  capabilities: number[];
  /** 1-3: how much the target buyer cares. */
  stakes: number;
  /** True when the proof point supports this angle. */
  proof: boolean;
}

export interface PriorEmail {
  step: Step;
  subject: string;
  body: string;
  /** Numbers of the CAPABILITIES that email declared it used (1-based). */
  capabilities?: number[];
  /** The buyer problem that email was about. */
  pain?: string;
}

export interface CopyRequest {
  step: Step;
  sender: SenderContext;
  senderFirstName: string;
  recipient: Recipient;
  research?: CompanyResearch | null;
  /** Emails already sent to this lead in this thread (for follow-ups). */
  prior?: PriorEmail[];
  /** Subject of email 1; follow-ups reply in the same thread. */
  threadSubject?: string;
  /** Stable per-lead value (e.g. their email) used to vary angles across leads. */
  seed?: string;
  /** Groups leads of one campaign, to stop the same sentence going to everyone. */
  campaignKey?: string;
  /** The campaign's angle plan (see planAngles); when absent a simple fallback is used. */
  angles?: Angle[];
  /** Today, for trigger ages. */
  now?: Date;
  styleExamples?: Array<{ subject: string; bodyText: string; recipientTitle?: string }>;
  /** Things the user rejected before. */
  avoid?: string[];
  /** Extra campaign instruction written by the user. */
  instruction?: string;
}

export interface Draft {
  subject: string;
  body: string;
  hook?: "fact" | "role";
  /** 1-based index into research.facts when hook is "fact". */
  factIndex?: number;
  /** 1-based numbers of the CAPABILITIES used. */
  capabilities?: number[];
  /** The buyer problem the email is about. */
  pain?: string;
  angle?: string;
}

/* ─── Rules ──────────────────────────────────────────────────────────── */

export const WORD_LIMITS: Record<Step, { min: number; max: number }> = {
  1: { min: 40, max: 95 },
  2: { min: 22, max: 70 },
  3: { min: 15, max: 55 },
};

/** Phrases that mark an email as mass-produced, salesy or presumptuous. */
export const BANNED_GROUPS: Record<string, string[]> = {
  "Throat-clearing": [
    "hope this email finds you",
    "hope this finds you",
    "hope you're well",
    "hope you are well",
    "i wanted to reach out",
    "reaching out because",
    "i'm reaching out",
    "my name is",
    "i came across",
    "i stumbled upon",
    "i noticed that you",
    "i was looking at your website",
  ],
  "Follow-up clichés": [
    "just following up",
    "following up on",
    "just checking in",
    "checking in",
    "bumping this",
    "circling back",
    "circle back",
    "touch base",
    "sounds like",
    "a different one",
    "the other thing",
    "one more thing",
    "last chance",
  ],
  "Hedging and guessing": ["probably", "i'd guess", "i would guess", "i imagine", "i assume", "likely still", "i bet", "chances are"],
  "Invented social proof": ["tell us", "we hear", "we see", "teams like yours", "companies like yours", "most companies", "most teams", "everyone is", "customers say", "clients say"],
  "Marketing words": [
    "quick question",
    "game changer",
    "game-changer",
    "revolutionize",
    "revolutionise",
    "supercharge",
    "unlock",
    "leverage",
    "synergy",
    "cutting-edge",
    "cutting edge",
    "seamless",
    "seamlessly",
    "robust",
    "streamline",
    "elevate",
    "empower",
    "best-in-class",
    "world-class",
    "next level",
    "in today's",
    "fast-paced",
    "solution",
  ],
  "Pushy or spammy": [
    "don't hesitate",
    "feel free to",
    "at your earliest convenience",
    "i'd love to",
    "would love to",
    "free trial",
    "guarantee",
    "act now",
    "limited time",
    "as an ai",
  ],
};
export const BANNED_PHRASES = Object.values(BANNED_GROUPS).flat();

const RECENCY = /\b(just|recently|newly|this (?:week|month|quarter)|last (?:week|month))\b/i;

const STEP_BRIEF: Record<Step, string> = {
  1: `EMAIL 1 OF 3: the first email. They have never heard of the sender.
1. Decide the hook first.
   - "fact": use ONE trigger (an event and its details count as one) only if you can state its consequence for this person plainly, without guessing, and a capability clearly helps with that consequence. Name the event the way a peer would, in a few words (e.g. the company it acquired), with relative timing ("this month", "last week") rather than a date, and no lists of places or numbers copied from the page. They know their own company; don't explain it. Then say the real consequence for THEIR job, in the second person: for an acquisition or merger, that is bringing the other company's people, vendors or processes into theirs, not a count of sites.
   - "role": otherwise, open with one concrete moment that people in their exact role live through (a specific day, task or decision in their week), stated as what tends to happen in that role, never as a claim about them or their company. Don't start with a label for their role ("For controllers, …", "For finance leaders, …"), and don't insert their company name into a general line. Not a question. No pretending you researched them.
   A weak fact is worse than no fact.
2. Then one sentence (25 words or fewer, not counting proof) on what changes for them with ONE capability (two at most), tied to exactly that situation. Describe the change in your own words; don't paste the capability wording. A proof point may follow as its own sentence, quoted exactly as written; never reword it or present it as the result of one capability. Otherwise leave proof out.
3. End with ONE low-effort interest question tied to the hook, answerable with "yes"; start it with the CTA LEAD-IN given below. A yes gets them your booking link, so ask about interest, not about how they work, and never promise a custom demo or anything built for them. Never ask them to name colleagues or give internal numbers. Not "Worth a look?", not a meeting time, not a link. This is the only question in the email.
4. Length 50 to 90 words, no sentence over 30 words. "Hi {first name}," on its own line, two or three short paragraphs, then the sign-off: the sender's first name, and the sender's company on the next line.
5. Subject: 2 to 4 words naming the hook's specific object, lowercase except proper nouns. Not "X at {company}", not a question, nothing salesy.`,
  2: `EMAIL 2 OF 3: first follow-up, two days after email 1, in the same thread. They did not reply.
- It must make sense even if it is the only email they read: never open with a reference to the last email ("Also", "Another thought", "The other thing").
- Give it its own reason to exist, using the SUGGESTED ANGLE below (a different problem and capability from email 1): one sentence on how that problem shows up in a week like theirs (a pattern for their role, tied in one clause to email 1's trigger or situation), then one sentence on what changes with the capability. Or answer a fair objection in one line. Do not introduce a new company fact.
- Never imply their process is immature (by hand, written down, case by case, from memory). Ask neutrally about tools or timing.
- Use only CAPABILITIES for anything the product does, and only where it logically applies to their situation.
- 25 to 60 words. "Hi {first name}," on its own line. End with one yes/no interest question (preferred for executives) or a neutral this-or-that about timing; never a survey of their tools or process, never a hypothetical "Would that save you…?". Same sign-off as email 1.
- Leave "subject" empty: the thread subject is set for you.`,
  3: `EMAIL 3 OF 3: final follow-up, two days after email 2, in the same thread. They did not reply.
- 15 to 45 words. "Hi {first name}," on its own line.
- One line naming the specific reason you wrote (email 1's trigger or situation) and the outcome you offered, in your own words, assuming nothing about how they feel.
- Then the easy out as ONE short question, in your own words: whether ${"${EASY_OUT}"} owns this day to day instead, or whether to come back later. Pick a calm time for their role given TODAY (for finance roles, avoid month-end, year-end close and audit season); never right before a deadline.
- No guilt, no "last chance", no "sounds like". Same sign-off as email 1.
- Leave "subject" empty: the thread subject is set for you.`,
};

const ROLE_GUIDE = `MATCH THE PAIN TO THE TITLE AND THE COMPANY
- Executives (C-level, VP, Head of): outcomes, risk, scaling without adding headcount, visibility across teams.
- Directors and managers: their team's workload, review time, exceptions, deadlines.
- Individual contributors: the specific task they do every day.
- Assume every company already runs mature tools and processes; say in a few words what is different from what they likely have. Pitch the specific gap next to them; never imply they work manually or inefficiently (by hand, keying in, spreadsheets, one at a time, chasing, spending hours).
- Executives (CFO, VP, Head of) get outcome, control or headcount framing; task-level details (keying, coding, routing) are for managers and individual contributors.
- Never guess their systems. If none are listed, don't write "If you use X, Y or Z".
- Don't assume details the trigger doesn't state (for example that an acquisition stays a separate entity, or that a new site has its own team).
- Write to them in the second person. Never describe their own job in the third person.`;

const EXAMPLES = `EXAMPLES OF THE STANDARD (a different seller: shift-scheduling software for clinics). Learn the shape only. Never reuse their wording.

Email 1, fact hook:
Subject: Plano and Frisco rotas
Hi Maria,

Saw Northside Health opened the Plano and Frisco clinics in March. That's two more rotas for you to build and cover every week.

Shiftly fills a call-out from the qualified staff who are free, in order, so the gap is closed before it reaches you.

Open to seeing how that would work across both clinics?

Jo
Shiftly

Email 1, role hook (no usable fact):
Subject: friday night call-outs
Hi Maria,

A Friday-night call-out usually means a run of texts until someone says yes.

Shiftly offers the open shift to everyone qualified and free, in order, and books the first yes.

Open to seeing what Friday cover looks like with it?

Jo
Shiftly

Email 2:
Hi Maria,

Shiftly can start from the rota you have now. The rules you keep in your head (no back-to-back nights for Sam, Dr. Lee only at Frisco) become checks it runs before anything is published.

Do you build each clinic's rota separately today, or as one?

Jo
Shiftly

Email 3:
Hi Maria,

Two extra clinics means two extra rotas, which is why I got in touch about filling call-outs automatically. Is scheduling at the new sites with the site managers instead?

Jo
Shiftly

Bad: "Northside Health is trusted by 40,000 patients, so I'd guess your schedule is complex. Who handles scheduling, and how many shifts do you fill a week?" It reads a patient count as their staffing load, guesses, and asks a stranger for names and numbers.`;

const SYSTEM = `You are a senior B2B copywriter who writes cold emails that get replies. Your emails read like a thoughtful peer typed them: short, specific, plain, and about the reader. You never sound like marketing, never flatter, never guess, and never invent anything. You return one JSON object and nothing else.`;

function list(items: Array<string | undefined | null>): string {
  const clean = items.map((i) => String(i ?? "").trim()).filter(Boolean);
  return clean.length ? clean.map((i) => `- ${i}`).join("\n") : "- (none)";
}

/** FNV-1a with a final mix, so small moduli (2 or 3 angles) still spread evenly. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) || []);

function overlap(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size) return 0;
  let n = 0;
  for (const w of wa) if (wb.has(w)) n++;
  return n / wa.size;
}

/** Capabilities the earlier emails used: what they declared, else what their wording shows. */
export function usedCapabilities(req: CopyRequest): string[] {
  const caps = capabilitiesOf(req.sender);
  const declared = new Set((req.prior ?? []).flatMap((p) => p.capabilities ?? []));
  if (declared.size) return caps.filter((_, i) => declared.has(i + 1));
  const sent = (req.prior ?? []).map((p) => p.body).join(" ");
  return caps.filter((c) => overlap(c, sent) >= 0.5);
}

const INTEGRATION = /\b(works (?:alongside|with)|integrat|connects? to|syncs? with)\b/i;

/** Integration capabilities only lead when the prospect's systems are known. */
function leadable(req: CopyRequest, cap: string): boolean {
  if (!INTEGRATION.test(cap)) return true;
  const systems = (req.research?.systems ?? []).map((x) => x.toLowerCase());
  return systems.some((x) => cap.toLowerCase().includes(x));
}

/** CTA openings rotated per lead so a campaign's asks don't all start the same way. */
export const CTA_LEADINS = ["Open to", "Worth", "Want to", "Interested in", "Curious whether", "Up for"];

export function ctaLeadIn(req: CopyRequest): string {
  return CTA_LEADINS[hashString(`cta|${req.campaignKey || ""}|${req.seed || req.recipient.company || ""}`) % CTA_LEADINS.length]!;
}

function describeAngle(req: CopyRequest, a: Angle): string {
  const caps = capabilitiesOf(req.sender);
  const names = a.capabilities.map((n) => caps[n - 1]).filter(Boolean);
  return `${a.pain} → ${names.join(" + ")}${
    req.sender.proofPoints?.length ? (a.proof ? " (the proof point supports this; you may use it)" : " (the proof point does not support this; leave it out)") : ""
  }`;
}

function planFor(req: CopyRequest): Angle[] {
  const caps = capabilitiesOf(req.sender);
  if (req.angles?.length) {
    return req.angles.filter((a) => a.capabilities.some((n) => caps[n - 1] && leadable(req, caps[n - 1]!)));
  }
  // Fallback without a plan: each capability on its own, no guessed pain.
  return caps.map((c, i) => ({ pain: "", capabilities: [i + 1], stakes: 2, proof: false })).filter((a) => leadable(req, caps[a.capabilities[0]! - 1]!));
}

/** For email 1 with no usable trigger: a high-stakes angle, rotated per lead so openers vary. */
export function suggestedRoleAngle(req: CopyRequest): string {
  const plan = planFor(req);
  // Rotate across every strong angle so a campaign's openers don't converge on one.
  const strong = plan.filter((a) => a.stakes >= 2);
  const pool = strong.length ? strong : plan;
  if (!pool.length) return "";
  const a = pool[hashString(`${req.campaignKey || ""}|${req.seed || req.recipient.company || ""}`) % pool.length]!;
  return a.pain ? describeAngle(req, a) : capabilitiesOf(req.sender)[a.capabilities[0]! - 1] || "";
}

/**
 * For email 2: an angle whose problem and capabilities differ from email 1's,
 * varied per lead so a campaign's follow-ups differ.
 */
export function suggestedAngle(req: CopyRequest): string {
  const plan = planFor(req);
  if (!plan.length) return "";
  const usedCaps = new Set((req.prior ?? []).flatMap((p) => p.capabilities ?? []));
  const usedCapText = new Set(usedCapabilities(req));
  const caps = capabilitiesOf(req.sender);
  const usedPains = (req.prior ?? []).map((p) => (p.pain || "").toLowerCase()).filter(Boolean);
  const fresh = plan.filter(
    (a) =>
      !a.capabilities.some((n) => usedCaps.has(n) || usedCapText.has(caps[n - 1] || "")) &&
      !usedPains.some((u) => u && a.pain && overlap(a.pain, u) >= 0.6),
  );
  if (!fresh.length) {
    // No planned angle left: offer a capability email 1 didn't use, without a guessed problem.
    const unusedCaps = caps.filter((c, i) => !usedCaps.has(i + 1) && !usedCapText.has(c) && leadable(req, c));
    if (!unusedCaps.length) return "";
    return unusedCaps[hashString(`${req.seed || req.recipient.company || ""}:${req.step}`) % unusedCaps.length]!;
  }
  const a = fresh[hashString(`${req.seed || req.recipient.company || ""}:${req.step}`) % fresh.length]!;
  return a.pain ? describeAngle(req, a) : caps[a.capabilities[0]! - 1] || "";
}

/** "3 weeks ago" style age for a trigger date, or "" when the date can't be read. */
export function relativeAge(date: string, now = new Date()): string {
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return "";
  const days = Math.round((now.getTime() - t) / 86_400_000);
  if (days < 0) return "";
  if (days <= 7) return "this week";
  if (days <= 31) return `${Math.round(days / 7)} weeks ago`;
  if (days <= 365) return `${Math.round(days / 30)} months ago`;
  return "over a year ago";
}

/** Triggers the writer may use: drops dated ones older than about four months. */
export function usableFacts(req: CopyRequest) {
  const now = req.now ?? new Date();
  return (req.research?.facts ?? []).filter((f) => {
    if (!f.date) return true;
    const t = Date.parse(f.date);
    return !Number.isFinite(t) || now.getTime() - t <= 120 * 86_400_000;
  });
}

/** Who a final email should suggest instead, from the reader's seniority. */
export function easyOutRole(title?: string | null): string {
  const t = String(title || "").toLowerCase();
  if (/\b(chief|ceo|cfo|coo|cto|president|founder|owner|vp|vice president|head of)\b/.test(t)) return "someone on your team (name the role one level down from them that runs this day to day)";
  if (/\b(director|controller|manager|lead)\b/.test(t)) return "the person on your team who runs this day to day (name that role)";
  return "a colleague who owns this (name the role)";
}

function capabilitiesOf(s: SenderContext): string[] {
  const caps = (s.capabilities ?? []).filter(Boolean);
  if (caps.length) return caps;
  return [s.valueProposition, s.companySummary].filter((x): x is string => Boolean(x && x.trim()));
}

export function buildCopyPrompt(req: CopyRequest, fix?: string[], lastDraft?: string): { system: string; prompt: string } {
  const r = req.recipient;
  const s = req.sender;
  const research = req.research;
  const facts = usableFacts(req);

  const priorBlock = (req.prior ?? [])
    .map((p) => `EMAIL ${p.step} (already sent):\nSubject: ${p.subject}\n${p.body}`)
    .join("\n\n");

  const examples = (req.styleExamples ?? []).slice(0, 3);
  const userExamples = examples.length
    ? examples
        .map((e, i) => `Example ${i + 1}${e.recipientTitle ? ` (to a ${e.recipientTitle})` : ""}:\nSubject: ${e.subject}\n${e.bodyText}`)
        .join("\n---\n")
    : "";

  const angle = req.step === 2 ? suggestedAngle(req) : "";
  const roleAngle = req.step === 1 ? suggestedRoleAngle(req) : "";
  const factsBlock =
    req.step === 1
      ? facts.length
        ? facts
            .map(
              (f, i) =>
                `${i + 1}. ${f.fact}${f.date ? ` (${relativeAge(f.date, req.now) || `dated ${f.date}`})` : " (no date on the page)"}  [page says: "${f.quote}"]`,
            )
            .join("\n")
        : "(none found: use the role hook)"
      : "(follow-ups do not introduce new facts)";

  const banned = Object.entries(BANNED_GROUPS)
    .map(([group, items]) => `${group}: ${items.join("; ")}`)
    .join("\n");

  const prompt = `SENDER
- Company: ${s.companyName}
- What they do: ${s.companySummary || "(not given)"}
- Offer: ${s.offerTitle || "(not given)"}${s.valueProposition ? ` — ${s.valueProposition}` : ""}
- CAPABILITIES (the only things you may say the product does, and only where they logically apply):
${capabilitiesOf(s).map((c, i) => `${i + 1}. ${c}`).join("\n") || "- (none)"}
- Problems buyers have (you may NAME these; claim to solve one only if a capability covers it):
${list(s.painPoints ?? [])}
- Proof you may use (numbers exactly as written):
${list(s.proofPoints ?? [])}
- Sign-off: ${req.senderFirstName || "(no name)"}, then ${s.companyName} on the next line

TODAY: ${(req.now ?? new Date()).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}

RECIPIENT
- Name: ${[r.firstName, r.lastName].filter(Boolean).join(" ") || "(unknown)"}
- Title: ${r.jobTitle || "(unknown)"}
- Company: ${r.company || "(unknown)"}
- Industry: ${r.industry || "(unknown)"}

THEIR COMPANY${research?.domain ? ` (${research.domain})` : ""}
- What they do: ${research?.summary || "(unknown)"}
- Their customers: ${research?.sellsTo || "(unknown)"}
- Size: ${research?.sizeHint || "(unknown)"}
- Systems their site names: ${research?.systems?.length ? research.systems.join(", ") : "(none)"}
- TRIGGERS (quoted from their site; use at most one, add no details):
${factsBlock}

${priorBlock ? `THREAD SO FAR\n${priorBlock}\n\n` : ""}${STEP_BRIEF[req.step].replace("${EASY_OUT}", easyOutRole(req.recipient.jobTitle))}
${angle ? `\nSUGGESTED ANGLE for this email (problem → capability): ${angle}\n` : ""}${
    roleAngle ? `\nANGLE FOR THIS LEAD if you use a role hook (problem → capability; other leads get other angles): ${roleAngle}\n` : ""
  }${req.step === 1 ? `CTA LEAD-IN for this lead: "${ctaLeadIn(req)} …?"\n` : ""}${
    req.step === 2 && usedCapabilities(req).length ? `Already used in this thread (don't lead with these again): ${usedCapabilities(req).join("; ")}\n` : ""
  }
${ROLE_GUIDE}

ALWAYS
- Plain text. No links, attachments, bullet points, bold, emojis or exclamation marks.
- A number may appear only if it is written the same way in a trigger's quote, a trigger's date, or the proof list.
- Never say "just", "recently", "yet", "now" or "this month" about a trigger unless it has a date.
- No placeholders like [Name] or {company}; write the real words.
- Never say or imply the email was researched, generated or automated.
- Short, common words. US English. Contractions are fine.
- Never use these phrases:
${banned}
${req.instruction?.trim() ? `- Campaign note from the user: ${req.instruction.trim()}\n` : ""}${(req.avoid ?? []).filter(Boolean).length ? `- The user rejected these before; never do them:\n${list(req.avoid ?? [])}\n` : ""}
${EXAMPLES}
${userExamples ? `\nVOICE EXAMPLES THE USER APPROVED (match their rhythm and directness):\n${userExamples}\n` : ""}${
    fix?.length
      ? `\nYOUR LAST DRAFT WAS REJECTED.${lastDraft ? `\n---\n${lastDraft}\n---` : ""}\nMake the smallest edits that fix every point, and keep what was good:\n${list(fix)}\n`
      : ""
  }
Return JSON only:
{${req.step === 1 ? '"hook": "fact or role", "factIndex": 0, ' : ""}"capabilities": [1], "pain": "the buyer problem this email is about", "angle": "a few words", "subject": "${req.step === 1 ? "2-4 words" : ""}", "body": "the email with \\n line breaks, greeting and sign-off included"}
capabilities: the numbers of the CAPABILITIES you used.${
    req.step === 1
      ? ` factIndex: the trigger number you used (${facts.length ? facts.map((_, i) => i + 1).join(", ") : "none available"}), or 0 for a role hook.`
      : ""
  }`;

  return { system: SYSTEM, prompt };
}

/* ─── Deterministic gate ─────────────────────────────────────────────── */

export function wordCount(text: string): number {
  return (text.match(/[A-Za-z0-9’'$%-]+/g) || []).length;
}

const SPELLED_NUMBERS = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "hundred", "thousand", "million"];

/** Numbers (digits or spelled) in the draft that appear in no allowed source. */
export function inventedNumbers(body: string, sources: string): string[] {
  const src = ` ${sources.toLowerCase().replace(/[^a-z0-9.%+$]+/g, " ")} `;
  const found: string[] = [];
  for (const raw of body.match(/\$?\d[\d,.]*\+?%?/g) || []) {
    const n = raw.replace(/,/g, "").replace(/\.$/, "");
    const bare = n.replace(/[$%+]/g, "");
    if (!bare) continue;
    if (!src.includes(` ${n.toLowerCase()} `) && !src.includes(` ${bare} `) && !src.includes(`${bare}%`)) found.push(raw);
  }
  for (const w of body.toLowerCase().match(/[a-z]+/g) || []) {
    if (SPELLED_NUMBERS.includes(w) && !src.includes(` ${w} `)) found.push(w);
  }
  return found;
}

/** Links or bare web addresses, except a company's own name that happens to be a domain (e.g. "Booking.com"). */
export function hasLink(body: string, allowedNames: Array<string | null | undefined>): boolean {
  if (/https?:\/\/|www\./i.test(body)) return true;
  const allowed = allowedNames.map((n) => String(n || "").toLowerCase()).filter(Boolean);
  const domains = body.toLowerCase().match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|co|net|org|ai|app|dev|us|uk)\b(?:\/\S*)?/g) || [];
  return domains.some((d) => !allowed.some((a) => a.includes(d)));
}

function containsPhrase(text: string, phrase: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9']+/g, " ")} `;
  return t.includes(` ${phrase.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim()} `);
}

function grams(text: string, n: number): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

const EXAMPLE_GRAMS = grams(`${EXAMPLES}`, 5);

/** A five-word run copied from the built-in examples, if any. */
export function copiedFromExamples(body: string): string | null {
  const strip = body.replace(/^(hi|hey|hello)[^\n]*\n/i, "");
  for (const g of grams(strip, 5)) if (EXAMPLE_GRAMS.has(g)) return g;
  return null;
}

/* Recent bodies per campaign, to catch one sentence going to every lead. */
const RECENT_PER_CAMPAIGN = 40;
const recent = new Map<string, string[]>();

export function rememberSent(req: CopyRequest, body: string) {
  if (!req.campaignKey) return;
  const list = recent.get(`${req.campaignKey}:${req.step}`) ?? [];
  list.push(body);
  if (list.length > RECENT_PER_CAMPAIGN) list.shift();
  recent.set(`${req.campaignKey}:${req.step}`, list);
}

export function clearRecentSent() {
  recent.clear();
}

function sentences(body: string): string[] {
  return body
    .split(/\n+|(?<=[.?])\s+/)
    .map((x) => x.trim())
    .filter((x) => wordCount(x) >= 8);
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return n / Math.min(a.size, b.size);
}

/** A sentence that closely matches sentences already sent to two or more other leads. */
export function repeatedAcrossLeads(req: CopyRequest, body: string): string | null {
  const history = req.campaignKey ? recent.get(`${req.campaignKey}:${req.step}`) ?? [] : [];
  // Openers matter most: one close match is already too many.
  const sanctioned = [...(req.sender.proofPoints ?? []), ...capabilitiesOf(req.sender)].map((x) => grams(x, 3));
  const opener = body.split("\n").map((l) => l.trim()).filter(Boolean)[1] || "";
  if (wordCount(opener) >= 6 && !sanctioned.some((x) => similarity(grams(opener, 3), x) >= 0.6)) {
    const og = grams(opener, 3);
    for (const h of history) {
      const ho = h.split("\n").map((l) => l.trim()).filter(Boolean)[1] || "";
      if (similarity(og, grams(ho, 3)) >= 0.5) return opener;
    }
  }
  if (history.length < 2) return null;
  const past = history.map((h) => sentences(h).map((x) => grams(x, 3)));
  // Approved proof and capability wording may repeat; it is the only allowed claim.
  for (const sent of sentences(body)) {
    const g = grams(sent, 3);
    if (sanctioned.some((x) => similarity(g, x) >= 0.6)) continue;
    const hits = past.filter((p) => p.some((x) => similarity(g, x) >= 0.6)).length;
    if (hits >= 2) return sent;
  }
  return null;
}

export function checkDraft(req: CopyRequest, draft: Draft): string[] {
  const problems: string[] = [];
  const body = draft.body.trim();
  const limits = WORD_LIMITS[req.step];
  const n = wordCount(body);

  if (!body) return ["The body is empty."];
  if (n < limits.min) problems.push(`Too short: ${n} words; write ${limits.min}-${limits.max}.`);
  if (n > limits.max) problems.push(`Too long: ${n} words; cut to at most ${limits.max}.`);
  if (hasLink(body, [req.recipient.company, req.sender.companyName])) problems.push("Remove every link or web address.");
  if (/[{}[\]]|<[^>]+>/.test(body)) problems.push("Remove placeholders, brackets and HTML.");
  if (body.includes("!")) problems.push("Remove exclamation marks.");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body)) problems.push("Remove emojis.");
  if (/^\s*[-*•]\s/m.test(body)) problems.push("No bullet points; write sentences.");
  const banned = BANNED_PHRASES.filter((p) => containsPhrase(body, p));
  if (banned.length) problems.push(`Remove these phrases: ${banned.join(", ")}.`);

  const first = String(req.recipient.firstName || "").trim();
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!/^(hi|hey|hello)\b/i.test(lines[0] || "")) problems.push(`Start with "Hi${first ? ` ${first}` : ""}," on its own line.`);
  else if (first && !lines[0]!.toLowerCase().includes(first.toLowerCase())) problems.push(`Greet them by first name: "Hi ${first},".`);
  const sig = String(req.senderFirstName || "").trim();
  if (sig && !lines.slice(-2).join(" ").includes(sig)) problems.push(`Sign off with "${sig}" on the last line.`);
  const opener = (lines[1] || "").toLowerCase();
  if (/^(also|another|plus|and|one more|the other)\b/.test(opener)) problems.push("The first line after the greeting must stand on its own.");

  // Their own title described in the third person ("the controller's desk").
  const title = String(req.recipient.jobTitle || "").toLowerCase().replace(/^(head of|vp|vice president of|director of)\s+/, "");
  const titleNoun = title.split(/\s+/).filter((w) => w.length > 3).pop();
  if (titleNoun && new RegExp(`\\bthe ${titleNoun}(?:'s|s)?\\b`, "i").test(body))
    problems.push(`Write to them as "you", not about "the ${titleNoun}".`);

  const facts = usableFacts(req);
  const sources = [
    ...facts.map((f) => `${f.quote} ${f.date || ""}`),
    ...(req.sender.proofPoints ?? []),
    req.recipient.company || "",
    req.sender.companyName,
    ...(req.prior ?? []).map((p) => p.body),
  ].join(" ");
  const invented = inventedNumbers(body, sources);
  if (invented.length) problems.push(`Remove numbers that are not in a trigger's quote or the proof list: ${invented.join(", ")}.`);

  const questions = (body.match(/\?/g) || []).length;
  if (req.step < 3 && questions > 1) problems.push(`Ask only one question; this draft asks ${questions}.`);
  const lastQ = (lines.filter((l) => l.includes("?")).pop() || "").split(/(?<=[.])\s+/).pop() || "";
  if (/^\s*(who|which|how many|how much|how long)\b|\bhow (many|much)\b|\bwho (owns|handles|runs|does|chases|approves|manages)\b[^?]*\?/i.test(lastQ))
    problems.push("Don't ask them to name people or give internal numbers; ask a yes/no or this-or-that question about their own setup.");
  if (req.step === 1) {
    const long = body.split(/(?<=[.?])\s+/).find((x) => wordCount(x) > 30);
    if (long) problems.push(`Split this sentence (over 30 words): "${long.slice(0, 60)}…"`);
  }
  if (!(req.research?.systems?.length) && /\bif you (?:run|use|are on)\b/i.test(body))
    problems.push("You don't know their systems; drop the \"If you use…\" line.");
  if (/\b(by hand|manually|keyed in|keying|written down|case by case|from memory|known by the team|in spreadsheets|one at a time|spends? hours|stop(?:s)? chasing|chasing approvers)\b/i.test(body))
    problems.push("Don't imply their process is manual or immature; describe the outcome instead.");
  if (req.step === 2 && /\bwould (?:that|this|it) (?:save|cut|help|free|make|reduce|speed|take)\b[^?]*\?/i.test(body))
    problems.push("Don't ask a hypothetical \"Would that save…?\"; ask how they work today, or whether they'd like to see it.");
  if (req.step === 3 && /\bbefore (?:your |the )?(?:quarter|year|month)[- ]?end\b|\bbefore (?:your |the )?(?:next )?close\b/i.test(lastQ))
    problems.push("Don't offer to come back right before a deadline; offer a calmer time.");
  if (req.step === 1 && /^for (?:[a-z-]+ ){0,3}[a-z-]+s?,/i.test(lines[1] || "")) problems.push("Open on a concrete moment, not a label for their role (\"For controllers, …\").");
  if (req.step === 1 && draft.hook !== "fact" && req.recipient.company) {
    const opener = lines[1] || "";
    if (new RegExp(`\\b(at|for) ${req.recipient.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(opener))
      problems.push("Don't paste their company name into a general opener; describe the pattern for their role.");
  }
  const copied = copiedFromExamples(body);
  if (copied) problems.push(`This copies the example wording ("${copied}"); write it in your own words.`);
  const repeated = repeatedAcrossLeads(req, body);
  if (repeated) problems.push(`This sentence is already going to other leads: "${repeated.slice(0, 70)}…". Make it specific to this person.`);

  if (req.step === 1) {
    const fi = Number(draft.factIndex || 0);
    if (draft.hook === "fact") {
      if (!facts[fi - 1]) problems.push("hook is \"fact\" but factIndex does not point to a trigger; use a listed trigger or the role hook.");
      else if (!facts[fi - 1]!.date && (RECENCY.test(lines.slice(1, 3).join(" ")) || /\b(yet|now|still setting up)\b/i.test(body)))
        problems.push("That trigger has no date: don't call it just, recent, yet or now.");
    } else if (RECENCY.test(lines.slice(1, 3).join(" "))) {
      problems.push("Do not imply recency without a dated trigger.");
    }
    const subject = draft.subject.trim();
    const sw = subject.split(/\s+/).filter(Boolean).length;
    if (!subject) problems.push("Write a subject.");
    else {
      if (sw < 2 || sw > 5) problems.push("Subject must be 2-4 words.");
      if (/[!?:]/.test(subject)) problems.push("Subject: no punctuation.");
      if (subject.split(/\s+/)[0] && /^[A-Z]/.test(subject) && !/[A-Z]/.test(String(req.recipient.company || "") + JSON.stringify(req.research?.facts ?? []))) problems.push("Subject: lowercase except proper nouns.");
      if (/\b(quick|question|re|fwd)\b/i.test(subject)) problems.push("Subject must not say quick, question, re or fwd.");
      const company = String(req.recipient.company || "").toLowerCase();
      if (company && subject.toLowerCase().endsWith(` at ${company}`)) problems.push('Subject: name the specific thing, not "X at {company}".');
    }
    const ask = lines.slice(-3).join(" ").toLowerCase();
    if (/worth a (look|chat)\?/.test(ask)) problems.push('End with a question about their situation, not "Worth a look?".');
  }
  if (req.step > 1 && req.prior?.length) {
    const firstLine = (req.prior[0]!.body.split("\n").find((l) => l.trim() && !/^(hi|hey|hello)\b/i.test(l.trim())) || "").trim();
    if (firstLine.length > 30 && body.toLowerCase().includes(firstLine.toLowerCase().slice(0, 30)))
      problems.push("Do not repeat email 1; bring a new angle.");
  }
  return problems;
}

/**
 * Problems serious enough that the draft must never be sent. Length is a
 * style target, so a slightly short or long email is acceptable; a rambling
 * one (over 140 words) is not.
 */
export function blockingProblems(problems: string[]): string[] {
  return problems.filter((p) => {
    if (p.startsWith("Too short")) return false;
    const long = p.match(/^Too long: (\d+)/);
    if (long) return Number(long[1]) > 140;
    return true;
  });
}

/** Final tidy-up: normalise whitespace and keep paragraphs short. */
export function tidyBody(body: string): string {
  return body
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function threadSubject(subject: string): string {
  const s = subject.trim();
  // Never produce a bare "Re:"; the caller keeps its own subject instead.
  if (!s) return "";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/* ─── Recipient's-eye review ─────────────────────────────────────────── */

const CRITIC_SYSTEM =
  "You are the recipient of a cold email: a busy professional who gets thirty a week. You judge strictly and fairly. Return one JSON object.";

export function buildCriticPrompt(req: CopyRequest, draft: Draft): string {
  const facts = req.research?.facts ?? [];
  return `You are ${req.recipient.jobTitle || "a professional"} at ${req.recipient.company || "a company"}.
What the sender's product can do (anything else it claims is invented):
${list(capabilitiesOf(req.sender))}
Proof the sender may cite: ${(req.sender.proofPoints ?? []).join("; ") || "(none)"}
Facts the sender knows about your company: ${facts.map((f) => `"${f.quote}"`).join(" | ") || "(none)"}
${req.prior?.length ? `Earlier emails in the thread:\n${req.prior.map((p) => p.body).join("\n---\n")}\n` : ""}
EMAIL ${req.step} OF 3:
Subject: ${draft.subject}
${draft.body}

Score 1-5 (5 best):
- logic: does every claim about your company follow from the facts, with no stretched or misread fact, no guessing and no unstated assumption? (5 if it uses no company fact and assumes nothing)
- claims: is everything it says the product does covered by the capabilities list, does each capability actually make sense in your situation (e.g. it cannot learn from history that doesn't exist yet), and is any proof quoted from the proof list without being reworded or credited to one specific feature?
- fit: does the capability it offers actually fix the problem it names? (1 if it names one problem and offers something that doesn't solve it)
- specific: is it clearly written for you, or could most sentences be sent to anyone?
- reply: how likely would you be to reply?
Return {"logic": n, "claims": n, "fit": n, "specific": n, "reply": n, "notes": ["each concrete problem, as an instruction to the writer"]}`;
}

export interface CriticVerdict {
  logic: number;
  claims: number;
  fit?: number;
  specific: number;
  reply: number;
  notes: string[];
}

export function criticProblems(v: CriticVerdict | null): string[] {
  if (!v) return [];
  const out: string[] = [];
  if (v.logic < 4) out.push("The recipient says a claim about their company is stretched, misread or guessed.");
  if (v.claims < 4) out.push("The recipient says the email claims something the product does not do, or uses proof that was not given.");
  if (v.fit !== undefined && v.fit < 4) out.push("The recipient says what you offer doesn't fix the problem you named; pick a problem the capability really solves.");
  if (v.specific < 4) out.push("The recipient says the email reads like a template; make it about their situation.");
  if (v.reply < 3) out.push("The recipient would not reply: make the hook more specific to them or the question easier to answer.");
  return out.length ? [...out, ...v.notes.map(String).filter(Boolean).slice(0, 4)] : [];
}

/* ─── Orchestration ──────────────────────────────────────────────────── */

export type LlmCall = (prompt: string, system: string) => Promise<any>;

export interface WriteResult extends Draft {
  problems: string[];
  attempts: number;
  review?: CriticVerdict | null;
}

function toDraft(req: CopyRequest, raw: any): Draft {
  const draft: Draft = {
    subject: String(raw?.subject || "").trim().replace(/[.!?]+$/, ""),
    body: tidyBody(String(raw?.body || raw?.bodyText || "")),
    hook: raw?.hook === "fact" ? "fact" : raw?.hook === "role" ? "role" : undefined,
    factIndex: Number(raw?.factIndex || 0) || undefined,
    capabilities: Array.isArray(raw?.capabilities) ? raw.capabilities.map(Number).filter((n: number) => n > 0) : undefined,
    pain: String(raw?.pain || "").trim() || undefined,
    angle: String(raw?.angle || "").trim() || undefined,
  };

  if (req.step > 1) draft.subject = threadSubject(req.threadSubject || req.prior?.[0]?.subject || draft.subject || "");
  return draft;
}

/**
 * Write one email: draft → deterministic gate → recipient's-eye review, with
 * the exact problems fed back for up to three attempts. Returns the best
 * draft; throws when the model gives nothing usable or a blocking problem
 * remains, so callers fall back to their approved baseline copy.
 */
export async function writeEmail(
  req: CopyRequest,
  llm: LlmCall,
  opts: { maxAttempts?: number; review?: boolean } = {},
): Promise<WriteResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const review = opts.review ?? true;
  let best: WriteResult | null = null;
  let fix: string[] | undefined;
  let lastDraft: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { system, prompt } = buildCopyPrompt(req, fix, lastDraft);
    const raw = await llm(prompt, system);
    if (!raw) throw new Error("No AI model configured");
    const draft = toDraft(req, raw);
    let problems = checkDraft(req, draft);
    let verdict: CriticVerdict | null = null;
    if (problems.length === 0 && review) {
      try {
        const v = await llm(buildCriticPrompt(req, draft), CRITIC_SYSTEM);
        verdict = v
          ? {
              logic: Number(v.logic) || 0,
              claims: Number(v.claims) || 0,
              fit: v.fit === undefined ? undefined : Number(v.fit) || 0,
              specific: Number(v.specific) || 0,
              reply: Number(v.reply) || 0,
              notes: Array.isArray(v.notes) ? v.notes.map(String) : [],
            }
          : null;
      } catch {
        verdict = null; // A failed review never blocks a draft that passed the gate.
      }
      problems = criticProblems(verdict);
    }
    const result: WriteResult = { ...draft, problems, attempts: attempt, review: verdict };
    if (!best || problems.length < best.problems.length) best = result;
    if (problems.length === 0) {
      rememberSent(req, result.body);
      return result;
    }
    fix = problems;
    lastDraft = `${draft.subject ? `Subject: ${draft.subject}\n` : ""}${draft.body}`;
  }
  if (!best || !best.body) throw new Error("The model returned no usable email");
  // Hard rules always block. A recipient who still finds a stretched fact or
  // an unsupported claim after three attempts blocks too: the caller then
  // sends its approved baseline copy instead.
  const hard = blockingProblems(checkDraft(req, best));
  if (best.review && (best.review.logic < 4 || best.review.claims < 4 || (best.review.fit ?? 5) < 4))
    hard.push(...criticProblems(best.review).slice(0, 2));
  if (hard.length) throw new Error(`Draft failed quality checks: ${hard.join(" ")}`);
  rememberSent(req, best.body);
  return best;
}

/** Which email of the sequence an instruction is for (older campaigns only say it in words). */
export function inferStep(stepPosition: number | null | undefined, instruction?: string): Step {
  if (stepPosition === 1 || stepPosition === 2 || stepPosition === 3) return stepPosition;
  if (stepPosition && stepPosition > 3) return 3;
  const i = String(instruction || "").toLowerCase();
  if (/follow-?up\s*#?\s*2|final|breakup|break-up|close the loop/.test(i)) return 3;
  if (/follow-?up/.test(i)) return 2;
  return 1;
}

/* ─── Angle plan (once per campaign) ─────────────────────────────────── */

const anglePlans = new Map<string, { at: number; plan: Angle[] }>();
const PLAN_TTL_MS = 24 * 3600_000;

export function buildAnglePlanPrompt(sender: SenderContext): string {
  const caps = capabilitiesOf(sender);
  return `Seller: ${sender.companyName}. ${sender.companySummary || ""}
Offer: ${sender.offerTitle || ""} ${sender.valueProposition ? `— ${sender.valueProposition}` : ""}
CAPABILITIES:
${caps.map((c, i) => `${i + 1}. ${c}`).join("\n")}
Buyer problems from the seller's research:
${list(sender.painPoints ?? [])}
Proof: ${(sender.proofPoints ?? []).join("; ") || "(none)"}

Map each buyer problem above to the capabilities that DIRECTLY fix it (not ones that merely share a word). Drop a problem no capability fixes. Do not add problems that are not in the list. Keep each problem's meaning but phrase it as a cost or a missed outcome the buyer owns ("the close slips while invoices sit with approvers"), never as manual or immature work ("by hand", "one at a time", "chasing"). Rate stakes 1-3 for how much the target buyer cares (3 = affects their main outcome, e.g. hitting a deadline or a number they own; 1 = a minor annoyance). Mark proof true only if the proof point is evidence for that problem.
Return {"angles": [{"pain": "...", "capabilities": [n], "stakes": n, "proof": true}]}`;
}

export function parseAnglePlan(raw: any, sender: SenderContext): Angle[] {
  const n = capabilitiesOf(sender).length;
  return (Array.isArray(raw?.angles) ? raw.angles : [])
    .map((a: any) => ({
      pain: String(a?.pain || "").trim().slice(0, 160),
      capabilities: (Array.isArray(a?.capabilities) ? a.capabilities : []).map(Number).filter((x: number) => x >= 1 && x <= n),
      stakes: Math.max(1, Math.min(3, Number(a?.stakes) || 1)),
      proof: Boolean(a?.proof),
    }))
    .filter((a: Angle) => a.pain && a.capabilities.length)
    .sort((x: Angle, y: Angle) => y.stakes - x.stakes)
    .slice(0, 8);
}

/** The campaign's problem → capability plan, built once and cached. Empty without a model. */
export async function planAngles(sender: SenderContext, llm: LlmCall, key: string, now = Date.now()): Promise<Angle[]> {
  const hit = anglePlans.get(key);
  if (hit && now - hit.at < PLAN_TTL_MS) return hit.plan;
  let plan: Angle[] = [];
  try {
    plan = parseAnglePlan(
      await llm(buildAnglePlanPrompt(sender), "You plan B2B outbound angles. You are strict about what a product actually fixes. Return one JSON object."),
      sender,
    );
  } catch {
    plan = [];
  }
  anglePlans.set(key, { at: now, plan });
  return plan;
}

export function clearAnglePlans() {
  anglePlans.clear();
}
