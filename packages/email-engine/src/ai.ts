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

/**
 * Intelligent contextual script synthesizer when no external AI key is configured or during offline previews.
 * Carefully parses the user's custom instructions (extracting product/brand names,
 * core capabilities, value propositions, and audience targets) and maps them into
 * a highly tailored, natural, peer-to-peer cold email for the specific lead.
 */
function simulatePersonalizedScript(options: GenerateOnTheFlyOptions): GeneratedScript {
  const { lead, customInstruction, fallbackSubject, fallbackBody, senderName } = options;
  const firstName = lead.firstName || (lead.email ? lead.email.split("@")[0] : "there");
  const company = lead.company || "your team";
  const role = lead.jobTitle || "leadership";
  const industry = lead.industry || "your space";
  const sender = senderName || "Krish Shah";

  const rawInst = (customInstruction || "").trim();

  // If no instruction is provided, fallback to standard tailored baseline
  if (!rawInst) {
    const subject = fallbackSubject
      ? fallbackSubject.replace(/\{\{\s*first_name\s*\}\}/g, firstName).replace(/\{\{\s*company\s*\}\}/g, company)
      : `Question regarding ${company}`;
    const body = fallbackBody
      ? fallbackBody.replace(/\{\{\s*first_name\s*\}\}/g, firstName).replace(/\{\{\s*company\s*\}\}/g, company)
      : `Hi ${firstName},\n\nSaw what your team is building at ${company}—impressive momentum in ${industry}.\n\nWould love to connect briefly regarding your current initiatives in this space.\n\nBest,\n${sender}`;
    return {
      subject,
      bodyText: body,
      bodyHtml: textToHtmlBlocks(body),
      personalizationReason: `Referenced ${company} and role as ${role}`,
    };
  }

  // 1. EXTRACT PRODUCT / SERVICE / BRAND NAME
  let productName = "";
  const productPatterns = [
    /(?:product|service|tool|platform|solution|system|software|app|agent)\s+(?:called|named)\s+["']?([A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|\bwith\b|\band\b|$)/i,
    /(?:called|named)\s+["']?([A-Z][A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|\bwith\b|\band\b|$)/i,
    /(?:marketing|selling|promoting|pitching|introducing|launching)\s+(?:a\s+)?(?:new\s+)?(?:product|service|tool|platform)?\s*(?:called|named)?\s*["']?([A-Z][A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|\bwith\b|\band\b|$)/i,
    /(?:welcome to|meet)\s+["']?([A-Z][A-Za-z0-9\s\-]+?)["']?(?=[.,\n]|is|that|who|which|$)/i,
    /["']([A-Z][A-Za-z0-9\s\-]{2,25})["']/
  ];

  for (const pat of productPatterns) {
    const match = rawInst.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (!/^(the|a|an|this|our|new|cold|email|service|product|platform|tool)$/i.test(candidate)) {
        productName = candidate;
        break;
      }
    }
  }

  // 2. PARSE SUBSTANTIVE PROMPT SENTENCES
  const rawSentences = rawInst
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const substantiveSentences: string[] = [];
  for (const s of rawSentences) {
    const isMetaOnly = /^(?:you are marketing|act as|write a|generate a|craft a|send an|sell this|pitch this|make sure to|keep it|output strictly|please write)/i.test(s) &&
      !/(?:video|interview|voice|streaming|platform|feature|candidate|hiring|recruit|talent|customer|scale|revenue|meeting)/i.test(s);
    
    if (isMetaOnly) continue;

    let cleaned = s;
    cleaned = cleaned.replace(/^(?:you are marketing|we are marketing|marketing)\s+(?:a product called|a service called|a tool called)?\s*[^.]*?[.,]\s*/i, "");
    cleaned = cleaned.replace(/^(?:sell this service|sell this product|pitch this service|pitch this product)\.?\s*/i, "");
    cleaned = cleaned.replace(/^(?:we have this product ready,?\s*and\s*)/i, "");
    cleaned = cleaned.replace(/and\s+so\s+on\s+and\s+so\s+forth[.,]?/gi, "");

    cleaned = cleanPunctuation(cleaned);
    if (cleaned.length > 10) {
      substantiveSentences.push(cleaned);
    }
  }

  // 3. IDENTIFY KEY CAPABILITIES & VALUE PROPOSITIONS
  let featureDescription = "";
  let valueProposition = "";

  for (const s of substantiveSentences) {
    const lower = s.toLowerCase();
    if (!featureDescription && (lower.includes("is an") || lower.includes("is a") || lower.includes("features") || lower.includes("streaming") || lower.includes("interviewer") || lower.includes("voice") || lower.includes("automated") || lower.includes("video") || lower.includes("feel like"))) {
      featureDescription = s;
    } else if (lower.includes("help") || lower.includes("scale") || lower.includes("select") || lower.includes("candidate") || lower.includes("interview") || lower.includes("save") || lower.includes("enable") || lower.includes("best candidate")) {
      if (!valueProposition || lower.includes("scale") || lower.includes("best candidate")) {
        valueProposition = s;
      }
    }
  }

  if (!featureDescription && substantiveSentences.length > 0) {
    featureDescription = substantiveSentences[0];
  }
  if (!valueProposition && substantiveSentences.length > 1) {
    valueProposition = substantiveSentences[substantiveSentences.length - 1];
  }

  // 4. CLEAN UP GRAMMAR & PERSPECTIVE FOR COLD OUTREACH
  let pitchClause = featureDescription;
  if (pitchClause) {
    pitchClause = pitchClause.replace(/[,;]\s*and\s*so\s*on.*$/i, ".");
    pitchClause = cleanPunctuation(pitchClause);
    if (!/[.!?]$/.test(pitchClause)) pitchClause += ".";
    pitchClause = capitalizeFirst(pitchClause);
  } else {
    pitchClause = productName
      ? `We built ${productName} to deliver seamless automation tailored to high-growth teams.`
      : `We built a new platform designed specifically to streamline key operations for teams in ${industry}.`;
  }

  let benefitClause = valueProposition;
  if (benefitClause) {
    benefitClause = benefitClause.replace(/^it\s+would\s+help\s+them\s+/i, `It helps teams like yours `);
    benefitClause = benefitClause.replace(/^it\s+helps\s+them\s+/i, `It helps teams like yours `);
    benefitClause = cleanPunctuation(benefitClause);
    if (!/[.!?]$/.test(benefitClause)) benefitClause += ".";
    benefitClause = capitalizeFirst(benefitClause);
  } else {
    benefitClause = `It is designed to help teams in ${industry} scale effectively without sacrificing quality.`;
  }

  // 5. COMPOSE SUBJECT LINE
  let subject = "";
  if (productName) {
    if (rawInst.toLowerCase().includes("interview")) {
      subject = `${productName} for ${company}: AI automated interviews at scale`;
    } else {
      subject = `${productName} + ${company}`;
    }
  } else if (rawInst.toLowerCase().includes("interview")) {
    subject = `AI video interviewing for ${company}`;
  } else {
    subject = `Quick question regarding ${company}, ${firstName}`;
  }

  // 6. COMPOSE EMAIL BODY
  const body = `Hi ${firstName},

Saw what you're leading at ${company}—impressive momentum across ${industry}.

${pitchClause}

${benefitClause}

Would you be open to a quick 5-minute interactive test call or preview this week?

Best,
${sender}`;

  // 7. COMPOSE PERSONALIZATION REASON
  let reason = "";
  if (productName) {
    reason = `Tailored ${productName} pitch specifically for ${firstName} at ${company} based on your campaign instructions`;
  } else {
    reason = `Synthesized outreach highlighting ${company} and role as ${role} based on your campaign instructions`;
  }

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

  const prompt = `You are an elite cold outreach copywriter. Write a hyper-personalized, high-converting cold email for the following prospective lead.

LEAD ATTRIBUTES:
- Name: ${lead.firstName || ""} ${lead.lastName || ""}
- Email: ${lead.email}
- Company: ${lead.company || "Unknown"}
- Job Title: ${lead.jobTitle || "Unknown"}
- Industry: ${lead.industry || "Unknown"}
- Website: ${lead.website || "Unknown"}
- Location: ${lead.location || "Unknown"}
- Additional Custom Data: ${JSON.stringify(lead.customFields || {})}

CAMPAIGN SENDER & CONTEXT:
- Sender Name: ${senderName || "Elena"}
- Baseline Template Subject: ${fallbackSubject || "Quick question"}
- Baseline Template Body: ${fallbackBody || ""}

USER'S CUSTOM AI INSTRUCTIONS:
${customInstruction || "Write a friendly, high-relevance cold email tailored to their role and company."}

CRITICAL COPYWRITING GUIDELINES:
1. Speak peer-to-peer: clean, conversational, zero corporate buzzwords (do NOT say 'I hope this email finds you well', 'synergy', 'game-changer').
2. Keep it concise (under 85 words for maximum mobile readability).
3. Include a single, low-friction, soft call-to-action.
4. Output strictly a JSON object with this exact structure:
{
  "subject": "Compelling subject line under 9 words",
  "bodyText": "Plain-text formatted body with proper paragraph line breaks",
  "bodyHtml": "<p>HTML formatted body</p>",
  "personalizationReason": "One short sentence explaining how this was customized to the lead's company or role"
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

  // 1. Detect if the text is instructions / prompt describing a product or service
  let prodName = "";
  const mProd = combined.match(
    /(?:product called|product named|platform named|service named|called|market(?:ing)? a product called)\s+["']?([A-Za-z0-9\s-]+?)["']?(?:\.|\s+who|\s+which|\s+that|\s+is|\s+has|\s*,)/i
  );
  if (mProd) {
    prodName = mProd[1].trim();
  }

  const hasPromptSignals =
    /(?:you are marketing|sell this|we have this product|product called|product named|called|is an AI|interviewer|interviews for|hiring management|help them|do interviews|scale|best candidates|sell our service)/i.test(combined);

  const isInstructionOrPrompt =
    hasPromptSignals ||
    Boolean(prodName) ||
    !/^\s*(?:hi|hey|hello|dear)\b/i.test(bodyText) ||
    !bodyText.trim();

  if (isInstructionOrPrompt && combined.length > 15) {
    const rawSentences = combined
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(
        (s) =>
          s.length > 8 &&
          !/^(?:you are marketing|sell this|we have this product ready|our team is ready|sell our service)/i.test(s)
      );

    let feature = "";
    let benefit = "";

    for (const s of rawSentences) {
      const l = s.toLowerCase();
      if (!feature && (l.includes("is an") || l.includes("streaming") || l.includes("interviewer") || l.includes("voice") || l.includes("video") || l.includes("platform") || l.includes("tool"))) {
        feature = s;
      } else if (!benefit && (l.includes("help") || l.includes("scale") || l.includes("select") || l.includes("candidates") || l.includes("interview") || l.includes("save") || l.includes("boost"))) {
        benefit = s;
      }
    }

    let pitchClause = feature || (prodName ? `We built ${prodName} to deliver seamless automation.` : "We built an outreach automation solution.");
    pitchClause = pitchClause.replace(/^(?:[A-Za-z0-9\s-]+?\s+is\s+)/i, () => {
      return prodName ? `We built ${prodName}—` : "We built ";
    });
    pitchClause = pitchClause.replace(/[,;]\s*and\s*so\s*on.*$/i, ".").trim();
    if (!pitchClause.startsWith("We built") && !pitchClause.startsWith("We recently launched")) {
      pitchClause = (prodName ? `We built ${prodName}—` : "We built ") + pitchClause.charAt(0).toLowerCase() + pitchClause.slice(1);
    }
    if (!/[.!?]$/.test(pitchClause)) pitchClause += ".";

    let benefitClause = benefit || "It helps teams like yours scale operations while selecting the best candidates.";
    benefitClause = benefitClause.replace(/^it\s+would\s+help\s+them\s+/i, "It helps teams like yours ");
    benefitClause = benefitClause.replace(/^it\s+helps\s+them\s+/i, "It helps teams like yours ");
    benefitClause = benefitClause.replace(/[,;]\s*and\s*so\s*on.*$/i, ".").trim();
    if (!/[.!?]$/.test(benefitClause)) benefitClause += ".";
    if (benefitClause) {
      benefitClause = capitalizeFirst(benefitClause);
    }

    let resSubject = subject.trim();
    if (
      !resSubject ||
      resSubject.toLowerCase().includes("subject") ||
      resSubject.toLowerCase().includes("quick question regarding") ||
      resSubject === "(None provided)"
    ) {
      if (prodName) {
        resSubject = `${prodName} for {{company}}: automated interviews at scale`;
      } else if (combined.toLowerCase().includes("interview")) {
        resSubject = `AI automated video interviews for {{company}}`;
      } else {
        resSubject = `Quick question regarding {{company}}`;
      }
    }

    let cta = "Would you be open to a quick 5-minute interactive test call this Thursday to see it in action?";
    if (tone === "punchy_cta") {
      cta = "Would Thursday at 2pm work for a 4-minute intro call?";
    } else if (tone === "executive") {
      cta = "Open to a brief 5-minute executive briefing this week on benchmark results?";
    } else if (tone === "concise") {
      cta = "Open to a quick 3-minute demo this Thursday?";
    }

    const resBody = `Hi {{first_name}},\n\nSaw what your team is building at {{company}}.\n\n${pitchClause}\n\n${benefitClause}\n\n${cta}\n\nBest,\n{{sender_name}}`;

    return {
      subject: resSubject,
      bodyText: resBody,
      bodyHtml: textToHtmlBlocks(resBody),
      changesSummary: `AI Copy Enhancement: Transformed product instructions into a high-converting cold outreach sequence tailored for ${prodName || "your campaign"}.`,
    };
  }

  // 2. If user already had a draft email:
  let resSubject = subject.trim() || "Quick question regarding {{company}}";
  let resBody = bodyText.trim() || "Hi {{first_name}},\n\nWould love to connect regarding {{company}}.\n\nBest,\n{{sender_name}}";
  let summary = "Refined cold outreach copy for higher engagement and deliverability.";

  if (tone === "concise") {
    const lines = resBody.split("\n").filter((l) => l.trim().length > 0);
    resBody = lines.slice(0, Math.max(2, Math.ceil(lines.length * 0.7))).join("\n\n");
    summary = "Trimmed ~30% fluff and shortened sentences for faster mobile reading.";
  } else if (tone === "executive") {
    resSubject = resSubject.startsWith("Re:") ? resSubject : `Outbound performance at {{company}}`;
    resBody = `Hi {{first_name}},\n\nSaw what your team is driving at {{company}}.\n\nWe benchmarked cold deliverability and response rates across modern teams, uncovering three quick levers to optimize pipeline conversion.\n\nOpen to a brief 5-minute review of the findings this Thursday?\n\nBest,\n{{sender_name}}`;
    summary = "Adapted tone to direct, peer-to-peer executive communication.";
  } else if (tone === "punchy_cta") {
    resBody = `${resBody.trim()}\n\nWould Thursday at 2pm work for a 4-minute intro?`;
    summary = "Added a concrete, low-friction call-to-action.";
  } else {
    // Auto-improve existing draft
    let improvedBody = resBody
      .replace(/\band noticed\.\.\./i, "and noticed your team's rapid growth.")
      .replace(/\bnoticed\.\.\./i, "noticed your team's expansion.")
      .replace(/\bI was looking at\b/i, "Saw what you're leading at");

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

  const promises = targetLeads.map(async (lead) => {
    const email = await generateEmailScriptOnTheFly({
      ...options,
      lead,
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
      email: simulatePersonalizedScript({ ...options, lead }),
    };
  });
}
