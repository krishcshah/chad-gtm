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

  const isHiringDomain = /(?:interview|interviews|interviewer|hiring|recruiting|recruit|recruiter|staffing|candidate|candidates|talent|applicant|applicants|headhunt|job seeker|requisition)/i.test(text);
  const isSalesDomain = /(?:sales|outbound|pipeline|sdr|bdr|prospecting|lead gen|cold email|meetings|booking)/i.test(text);
  const isTechDomain = /(?:developer|engineering|code|devops|cloud|infrastructure|api|software engineers)/i.test(text);

  const hasSubscription = /(?:subscription|monthly|retainer|annual plan|pricing)/i.test(text);
  const hasAtScale = /(?:scale|at scale|scaling|volume|hundreds|thousands)/i.test(text);

  let featureSummary = "";
  if (lower.includes("video") && lower.includes("voice") && (lower.includes("reactionary") || lower.includes("live") || lower.includes("streaming") || lower.includes("human-like"))) {
    featureSummary = "an AI automated interviewer with live, reactionary video and voice streaming that feels like an authentic video call";
  } else if (lower.includes("video") && lower.includes("interviewer")) {
    featureSummary = "an AI automated interviewer with real-time video and voice interaction";
  } else if (productName) {
    featureSummary = `an intelligent platform designed to automate high-touch workflows`;
  }

  let valueSummary = "";
  if (isHiringDomain) {
    if (lower.includes("scale") && lower.includes("candidate")) {
      valueSummary = "conduct initial interviews at scale and filter out only the highest-signal candidates";
    } else {
      valueSummary = "screen candidates 24/7 and deliver structured evaluation data without manual phone screens";
    }
  } else if (isSalesDomain) {
    valueSummary = "scale personalized outreach and pipeline generation without expanding SDR headcount";
  } else {
    valueSummary = "eliminate operational bottlenecks and scale output without adding overhead";
  }

  return {
    productName,
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
 * Intelligent contextual script synthesizer adhering to The Transition Principle.
 * Strictly avoids generic clichés like "Saw what your team is building".
 * Transitions seamlessly from the prospect's operational reality (industry, role, bottlenecks, CSV data)
 * to what the product delivers at scale on a predictable monthly model.
 */
function simulatePersonalizedScript(options: GenerateOnTheFlyOptions): GeneratedScript {
  const { lead, customInstruction, fallbackSubject, fallbackBody, senderName, index = 0 } = options;
  const firstName = lead.firstName || (lead.email ? lead.email.split("@")[0] : "there");
  const company = lead.company || "your team";
  const role = lead.jobTitle || "leadership";
  const industry = lead.industry || "recruiting & talent";
  const sender = senderName || "Krish Shah";

  const rawInst = (customInstruction || "").trim();

  // If no instruction is provided, fallback to tailored operational baseline (NO clichés)
  if (!rawInst) {
    const subject = fallbackSubject
      ? fallbackSubject.replace(/\{\{\s*first_name\s*\}\}/g, firstName).replace(/\{\{\s*company\s*\}\}/g, company)
      : `Question regarding ${company}'s operations`;
    const body = fallbackBody
      ? fallbackBody.replace(/\{\{\s*first_name\s*\}\}/g, firstName).replace(/\{\{\s*company\s*\}\}/g, company)
      : `Hi ${firstName},\n\nManaging operational velocity across ${industry} is typically where high-growth teams at ${company} face capacity bottlenecks.\n\nWould love to connect briefly regarding how your team is structuring priorities this quarter.\n\nBest,\n${sender}`;
    return {
      subject,
      bodyText: body,
      bodyHtml: textToHtmlBlocks(body),
      personalizationReason: `Referenced ${company} and role as ${role}`,
    };
  }

  const ctx = parseCampaignPrompt(rawInst);
  const isLeadHiring = ctx.isHiringDomain || /recruiting|staffing|talent|hiring|hr|human resources|headhunt/i.test(`${industry} ${role} ${company}`);

  let hook = "";
  let bridge = "";
  let value = "";
  let commercial = "";
  let cta = "";
  let subject = "";

  if (isLeadHiring) {
    const angle = index % 3;
    if (angle === 0) {
      hook = `Between screening applicant flow and coordinating initial phone screens across multiple client requisitions, conducting first-round interviews is usually the heaviest time drain for recruiting teams at ${company}.`;
      bridge = `We built ${ctx.productName || 'Hello Dolly'}—${ctx.featureSummary || 'an AI automated interviewer with live, reactionary video and voice streaming that feels like an authentic video call'}.`;
      value = `Candidates interview with Dolly 24/7. She converses and reacts in real time just like a human interviewer, testing communication and domain skills to filter out the highest-signal talent before your recruiters step in.`;
      commercial = `We offer this on a flexible monthly subscription so hiring management companies like ${company} can run candidate interviews at scale without adding recruiter headcount.`;
      cta = `Would you be open to a 3-minute interactive test call with Dolly this week to see how reactionary it feels in real time?`;
      subject = `${ctx.productName || 'Hello Dolly'} for ${company}: AI video interviews at scale`;
    } else if (angle === 1) {
      hook = `For talent partners and search firms, submitting thoroughly vetted candidates faster than competing recruiters wins the client mandate every time.`;
      bridge = `With ${ctx.productName || 'Hello Dolly'}, ${company} can run interactive, human-like video interviews on every applicant the moment they apply.`;
      value = `Dolly streams live reactionary video and voice that feels like an authentic video call—actively probing situational responses and ranking candidate signal so only top 5% finalists reach your desk.`;
      commercial = `Our predictable monthly subscription model gives ${company} unlimited interview throughput across all client accounts with zero per-screen friction.`;
      cta = `Could I send you a 1-click test link so you can experience a 60-second interview call with Dolly yourself?`;
      subject = `AI video interviewing for ${company}'s candidate pipeline`;
    } else {
      hook = `Most automated applicant screening relies on resume keyword matching, which misses high-potential talent and still leaves recruiters stuck conducting dozens of introductory calls.`;
      bridge = `We launched ${ctx.productName || 'Hello Dolly'} to give ${company} a true live AI video interviewer that speaks, listens, and reacts like an authentic interviewer.`;
      value = `Dolly evaluates communication, problem-solving, and role-specific competencies 24/7, passing structured scorecards and only the best filtered candidates straight to your account managers.`;
      commercial = `Delivered on a straightforward monthly subscription, it lets hiring agencies scale client intake 5x without ballooning overhead.`;
      cta = `Would you be against testing a 2-minute live video screen with Dolly this Thursday?`;
      subject = `Automating first-round candidate screens at ${company}`;
    }
  } else if (ctx.isSalesDomain) {
    const angle = index % 3;
    if (angle === 0) {
      hook = `Scaling outbound pipeline without burning out SDRs or compromising message relevance is usually the hardest lever to pull in modern sales.`;
      bridge = `We built ${ctx.productName || 'our outbound engine'} to synthesize research-backed outreach for ${company}'s target accounts on demand.`;
      value = `It drafts and delivers hyper-personalized touchpoints that convert, cutting hours of manual prospecting.`;
      commercial = `Delivered on a predictable monthly model to scale outbound volume with zero per-seat bloat.`;
      cta = `Open to a brief 4-minute benchmark walk-through this Thursday?`;
      subject = `${ctx.productName ? ctx.productName + ' for ' : ''}Pipeline growth at ${company}`;
    } else if (angle === 1) {
      hook = `Most sales teams waste 15+ hours a week manually researching prospect accounts before sending a single personalized line.`;
      bridge = `With ${ctx.productName || 'our platform'}, ${company} can turn structured prospect signals into personalized outbound at scale.`;
      value = `It analyses company momentum, tech stack, and role focus to deliver high-converting messages automatically.`;
      commercial = `Structured on a simple monthly plan to accelerate outbound pipeline without expensive software suites.`;
      cta = `Could I share a 2-minute video walkthrough comparing response rates?`;
      subject = `Accelerating outbound pipeline for ${company}`;
    } else {
      hook = `Between mailbox deliverability limits and lead decay, getting steady replies from key decision-makers has become a major roadblock for sales teams at ${company}.`;
      bridge = `We engineered ${ctx.productName || 'our system'} to solve cold deliverability and scale engagement simultaneously.`;
      value = `It distributes volume across rotating, warmup-protected mailboxes with peer-to-peer personalization.`;
      commercial = `Available on a flat monthly subscription to unlock unlimited pipeline generation.`;
      cta = `Would you be against a 4-minute benchmark check this week?`;
      subject = `Solving outbound deliverability at ${company}`;
    }
  } else {
    hook = `Eliminating operational bottlenecks while scaling execution across ${industry} is usually the hardest challenge for teams at ${company}.`;
    bridge = `We built ${ctx.productName || 'our platform'} to streamline critical workflows through intelligent automation.`;
    value = `It enables teams like yours to scale throughput and performance with minimal overhead.`;
    commercial = `Structured on a flexible monthly subscription to fit high-growth teams.`;
    cta = `Open to a brief 4-minute demo this Thursday to review benchmarks?`;
    subject = `${ctx.productName ? ctx.productName + ' for ' : 'Outreach for '}${company}`;
  }

  const customKeys = lead.customFields ? Object.keys(lead.customFields) : [];
  const customDetail = customKeys.length > 0 ? ` (leveraged CSV columns: ${customKeys.slice(0, 3).join(", ")})` : "";
  const reason = `Transitioned from ${company}'s operational workflow in ${industry} to ${ctx.productName || 'the offer'}, highlighting ${ctx.valueSummary}${ctx.hasSubscription ? ' on a monthly subscription' : ''}${customDetail}.`;

  const bodyParts = [hook, bridge, value, commercial, cta].filter(Boolean);
  const body = `Hi ${firstName},\n\n${bodyParts.join("\n\n")}\n\nBest,\n${sender}`;

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
  model = "gemini-1.5-flash",
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
      if ((res.status === 404 || res.status === 400) && model !== "gemini-1.5-flash") {
        return callGemini(prompt, apiKey, "gemini-1.5-flash", timeoutMs);
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
  const provider = (options.provider || "google").toLowerCase();
  const apiKey = resolveApiKey(provider, options.apiKey);

  if (!apiKey) {
    // If no API key configured, use high-fidelity simulation engine
    return simulatePersonalizedScript(options);
  }

  const { lead, customInstruction, senderName, fallbackSubject, fallbackBody } = options;

  const customFieldsFormatted = lead.customFields && Object.keys(lead.customFields).length > 0
    ? Object.entries(lead.customFields).map(([k, v]) => `  * ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n")
    : "  (None provided)";

  const prompt = `You are an elite B2B cold outreach copywriter and conversion strategist. Write a hyper-personalized, high-converting cold email for the following prospective lead.

LEAD ATTRIBUTES & FULL CSV ROW:
- Full Name: ${lead.firstName || ""} ${lead.lastName || ""}
- Email: ${lead.email}
- Company: ${lead.company || "Unknown"}
- Job Title: ${lead.jobTitle || "Unknown"}
- Industry: ${lead.industry || "Unknown"}
- Website: ${lead.website || "Unknown"}
- Location: ${lead.location || "Unknown"}
- Phone: ${lead.phone || "Unknown"}
- LinkedIn: ${lead.linkedin || "Unknown"}
- All Additional CSV Row Columns:
${customFieldsFormatted}

CAMPAIGN SENDER & CONTEXT:
- Sender Name: ${senderName || "Elena"}
- Baseline Template Subject: ${fallbackSubject || "Quick question"}
- Baseline Template Body: ${fallbackBody || ""}

USER'S CAMPAIGN INSTRUCTIONS & VALUE OFFER:
${customInstruction || "Write a friendly, high-relevance cold email tailored to their role and company."}

CRITICAL COPYWRITING & THE TRANSITION PRINCIPLE:
1. STRICT BAN ON GENERIC OPENING CLICHÉS:
   - NEVER start with or use fake compliments: "Saw what your team is building at...", "Saw what you're leading at...", "Impressive momentum at...", "Hope this email finds you well", or "I came across your profile".
   - Zero corporate buzzwords (no "game-changer", "synergy", "paradigm shift").

2. THE TRANSITION PRINCIPLE (MANDATORY):
   - You MUST seamlessly transition from what the lead's company does (their industry, role, daily operational reality, screening/recruiting bottlenecks) to what our offering delivers.
   - For example, if contacting hiring management companies / recruiting agencies to sell an AI automated interviewer (e.g. Hello Dolly with live reactionary video and voice streaming): start directly with their operational challenge of screening applicant volume across open requisitions -> bridge to how our live video/voice AI conducts reactionary interviews 24/7 -> explain how it filters top candidate signal at scale -> mention the predictable monthly subscription model -> end with a low-friction invitation to test it.

3. USE THE FULL CSV ROW:
   - If the lead has specific custom fields (e.g. specialized roles, locations, clients, team size), reference them naturally to show genuine context.

4. FORMAT & LENGTH:
   - Keep it concise (under 95 words total).
   - Single, low-friction, conversational call-to-action (e.g., offering a 3-minute interactive preview or test call).
   - Output strictly a JSON object:
{
  "subject": "Compelling subject line under 9 words",
  "bodyText": "Plain-text formatted body with proper paragraph line breaks",
  "bodyHtml": "<p>HTML formatted body</p>",
  "personalizationReason": "One clear sentence explaining the contextual transition from their operational reality to our offer using their CSV data"
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
    const subject = String(parsed.subject || fallbackSubject || "Quick question").trim();
    const bodyHtml = String(parsed.bodyHtml || textToHtmlBlocks(bodyText)).trim();
    const personalizationReason = String(parsed.personalizationReason || "Tailored using lead background").trim();

    return { subject, bodyText, bodyHtml, personalizationReason };
  } catch (err) {
    console.warn("[ai-engine] Generation API failed, falling back to simulated script:", err);
    return simulatePersonalizedScript(options);
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
    let hook = "";
    let bridge = "";
    let value = "";
    let commercial = "";
    let cta = "";

    if (ctx.isHiringDomain) {
      const persona = /dolly/i.test(ctx.productName + " " + combined) ? "Dolly" : (ctx.productName || "our AI interviewer");
      resSubject = `${ctx.productName || 'Hello Dolly'} for {{company}}: AI video interviews at scale`;
      hook = `Between screening applicant flow and coordinating initial phone screens across open requisitions, conducting first-round interviews is usually the heaviest time drain for hiring teams at {{company}}.`;
      bridge = `We built ${ctx.productName || 'Hello Dolly'}—${ctx.featureSummary || 'an AI automated interviewer with live, reactionary video and voice streaming that feels like an authentic video call'}.`;
      value = `Candidates interview with ${persona} 24/7. She converses and reacts in real time just like a human interviewer, testing communication and domain skills to filter out the highest-signal talent before your recruiters step in.`;
      commercial = `We offer this on a flexible monthly subscription so hiring management companies like {{company}} can run candidate interviews at scale without adding recruiter headcount.`;
      cta = `Would you be open to a 3-minute interactive test call with ${persona} this week to see how reactionary it feels in real time?`;
    } else if (ctx.isSalesDomain) {
      resSubject = `${ctx.productName ? ctx.productName + ' for ' : ''}Pipeline growth at {{company}}`;
      hook = `Scaling outbound pipeline without burning out SDRs or compromising message relevance is usually the hardest lever to pull in modern sales.`;
      bridge = `We built ${ctx.productName || 'our outbound engine'} to synthesize research-backed outreach for {{company}}'s target accounts on demand.`;
      value = `It drafts and delivers hyper-personalized touchpoints that convert, cutting hours of manual prospecting.`;
      commercial = `Delivered on a predictable monthly model to scale outbound volume with zero per-seat bloat.`;
      cta = `Open to a brief 4-minute benchmark walk-through this Thursday?`;
    } else {
      resSubject = `${ctx.productName ? ctx.productName + ' for ' : 'Outreach for '}{{company}}`;
      hook = `Eliminating operational bottlenecks while scaling execution is usually where high-growth teams at {{company}} lose the most momentum.`;
      bridge = `We built ${ctx.productName || 'our platform'} to streamline critical workflows through intelligent automation.`;
      value = `It enables teams like yours to scale throughput and performance with minimal overhead.`;
      commercial = `Structured on a flexible monthly subscription to fit high-growth teams.`;
      cta = `Open to a brief 4-minute demo this Thursday to review benchmarks?`;
    }

    if (tone === "concise") {
      if (ctx.isHiringDomain) {
        hook = `Conducting initial screening calls across client requisitions pulls recruiters away from closing placements.`;
        bridge = `We built ${ctx.productName || 'Hello Dolly'}, an AI video interviewer with live, reactionary video and voice streaming that feels like an authentic video call.`;
        value = `Dolly screens candidates 24/7 and delivers vetted, top-tier finalists on a flexible monthly subscription.`;
        cta = `Open to a 2-minute live test this Thursday?`;
        commercial = "";
      } else {
        hook = `Eliminating manual operational bottlenecks is where teams at {{company}} can unlock significant scale.`;
        bridge = `We built ${ctx.productName || 'our platform'} to automate high-touch workflows.`;
        value = `Delivers predictable output on a flexible monthly subscription.`;
        cta = `Open to a 2-minute demo this Thursday?`;
        commercial = "";
      }
    } else if (tone === "punchy_cta") {
      cta = `Would Thursday at 2pm work for a 4-minute interactive test call?`;
    } else if (tone === "executive") {
      cta = `Open to a brief 5-minute executive briefing this week on benchmark results?`;
    }

    const bodyParts = [hook, bridge, value, commercial, cta].filter(Boolean);
    const resBody = `Hi {{first_name}},\n\n${bodyParts.join("\n\n")}\n\nBest,\n{{sender_name}}`;

    return {
      subject: resSubject,
      bodyText: resBody,
      bodyHtml: textToHtmlBlocks(resBody),
      changesSummary: `Synthesized high-converting outreach sequence step for ${ctx.productName || 'your campaign'}, transitioning from the prospect's operational workflow to the offer.`,
    };
  }

  // 2. If user already had a draft email:
  let resSubject = subject.trim() || "Quick question regarding {{company}}";
  let resBody = bodyText.trim() || "Hi {{first_name}},\n\nWould love to connect regarding {{company}}.\n\nBest,\n{{sender_name}}";
  let summary = "Refined cold outreach copy for higher engagement and deliverability.";

  // Clean out any historical cliché openings from existing draft
  resBody = resBody
    .replace(/^Hi\s+\{\{first_name\}\},\s*\n+Saw what your team is building at \{\{company\}\}[^\n]*\n+/i, "Hi {{first_name}},\n\n")
    .replace(/^Hi\s+\{\{first_name\}\},\s*\n+Saw what you're leading at \{\{company\}\}[^\n]*\n+/i, "Hi {{first_name}},\n\n");

  if (tone === "concise") {
    const lines = resBody.split("\n").filter((l) => l.trim().length > 0);
    resBody = lines.slice(0, Math.max(2, Math.ceil(lines.length * 0.7))).join("\n\n");
    summary = "Trimmed fluff and shortened sentences for faster mobile reading.";
  } else if (tone === "executive") {
    resSubject = resSubject.startsWith("Re:") ? resSubject : `Outbound performance at {{company}}`;
    resBody = `Hi {{first_name}},\n\nScreening candidate pipelines across active client requisitions often creates an operational ceiling for search and hiring teams at {{company}}.\n\nWe benchmarked first-round candidate evaluation throughput across modern talent firms, uncovering three levers to compress time-to-submittal by over 60% with live reactionary AI interviewers.\n\nOpen to a brief 5-minute review of the findings this Thursday?\n\nBest,\n{{sender_name}}`;
    summary = "Adapted tone to direct, peer-to-peer executive communication.";
  } else if (tone === "punchy_cta") {
    resBody = `${resBody.trim()}\n\nWould Thursday at 2pm work for a 4-minute intro?`;
    summary = "Added a concrete, low-friction call-to-action.";
  } else {
    // Auto-improve existing draft
    let improvedBody = resBody
      .replace(/\band noticed\.\.\./i, "and noticed your team's expansion.")
      .replace(/\bnoticed\.\.\./i, "noticed your team's expansion.")
      .replace(/\bI was looking at\b/i, "Focusing on operational velocity at");

    if (!improvedBody.toLowerCase().includes("thursday") && !improvedBody.toLowerCase().includes("open to")) {
      improvedBody += "\n\nWould you be open to a quick 5-minute intro this Thursday?";
    }

    resBody = improvedBody;
    summary = "Auto-improved hook, sharpened value proposition, and optimized mobile readability.";
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

  const prompt = `You are an elite B2B cold email copywriter and marketing strategist. Transform or improve the following outreach content into a high-converting, personalized cold email sequence step.

ORIGINAL INPUT / INSTRUCTIONS:
Subject: ${subject || "(None provided)"}
Body / Prompt:
${bodyText || "(None provided)"}

REQUESTED TONE / GOAL: ${tone}
ADDITIONAL INSTRUCTION: ${instruction || "Craft a compelling, personalized cold email. If the input contains product details or marketing instructions, write an outreach email that pitches that product to prospects. Include variables like {{first_name}}, {{company}}, and {{sender_name}}."}

CRITICAL RULES & THE TRANSITION PRINCIPLE:
1. STRICT BAN ON OPENING CLICHÉS:
   - NEVER start with: 'Saw what your team is building at...', 'Saw what you're leading at...', 'Impressive momentum', 'Hope this email finds you well', or 'I came across your profile'.
2. THE TRANSITION PRINCIPLE (MANDATORY):
   - You MUST smoothly transition from what the prospect does (their industry, role, operational challenges, screening/recruiting bottlenecks) to what our offering delivers.
   - For example, if pitching Hello Dolly (an AI automated interviewer with live, reactionary video and voice streaming for hiring agencies on a monthly subscription): hook into their time drain conducting first-round screening calls across requisitions -> bridge to how Hello Dolly conducts reactionary video screens 24/7 -> highlight filtering top candidates at scale on a monthly subscription -> end with a low-friction invite to test it.
3. VARIABLES:
   - Always use proper merge tags: {{first_name}}, {{company}}, and {{sender_name}}.

Output strictly a JSON object:
{
  "subject": "Compelling subject line with {{company}} personalization",
  "bodyText": "Refined plain text cold email body with {{first_name}}, {{company}}, {{sender_name}}",
  "bodyHtml": "<p>Refined HTML body</p>",
  "changesSummary": "Brief explanation of what was created or improved"
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
): Promise<Array<{ lead: LeadProfile; email: GeneratedScript }>> {
  const targetLeads = leads.slice(0, options.maxCount || 10);

  const promises = targetLeads.map(async (lead, idx) => {
    const email = await generateEmailScriptOnTheFly({
      ...options,
      lead,
      index: idx,
    });
    return { lead, email };
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
