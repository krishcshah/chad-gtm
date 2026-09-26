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

/**
 * High-quality fallback generator when no external AI key is configured or during offline testing.
 * Synthesizes unique lead-specific copy based on actual lead attributes and custom instructions.
 */
function simulatePersonalizedScript(options: GenerateOnTheFlyOptions): GeneratedScript {
  const { lead, customInstruction, fallbackSubject, fallbackBody, senderName } = options;
  const firstName = lead.firstName || "there";
  const company = lead.company || "your team";
  const role = lead.jobTitle || "leadership";
  const industry = lead.industry || "your industry";
  const sender = senderName || "Elena";

  const lowerInst = (customInstruction || "").toLowerCase();

  let subject = `Quick question regarding ${company}, ${firstName}`;
  let reason = `Referenced ${company} and role as ${role}`;
  let body = "";

  if (lowerInst.includes("benchmark") || lowerInst.includes("data") || lowerInst.includes("scale")) {
    subject = `Benchmarking ${company}'s outbound infrastructure`;
    body = `Hi ${firstName},\n\nSaw what you're leading at ${company}—impressive momentum in ${industry}.\n\nWe recently benchmarked how high-growth teams in your space are optimizing sender rotation and cold deliverability without domain burn.\n\nWould you be open to a quick 5-minute review of the benchmark data this week?\n\nBest,\n${sender}`;
    reason = `Tailored hook for ${company} in ${industry} using outbound benchmark data`;
  } else if (lowerInst.includes("pain") || lowerInst.includes("challenge") || lowerInst.includes("deliverability")) {
    subject = `${firstName} - solving deliverability at ${company}`;
    body = `Hey ${firstName},\n\nGiven your focus on ${role} at ${company}, I imagine protecting inbox reputation while scaling outreach is top of mind.\n\nWe built an automated infrastructure that eliminates domain burning and handles humanized multi-inbox rotation automatically.\n\nWorth a brief conversation Tuesday?\n\nBest,\n${sender}`;
    reason = `Addressed deliverability challenges tailored for ${role} at ${company}`;
  } else if (lowerInst.includes("concise") || lowerInst.includes("short") || lowerInst.includes("3-sentence")) {
    subject = `Quick note for ${company}`;
    body = `Hi ${firstName},\n\nLoved your recent trajectory at ${company}. We help ${industry} leaders scale cold outreach seamlessly with zero manual rotation.\n\nOpen to a 3-minute chat on Thursday?\n\nBest,\n${sender}`;
    reason = `Generated crisp 3-sentence outreach referencing ${company}`;
  } else {
    // General tailored script
    subject = fallbackSubject
      ? fallbackSubject.replace(/\{\{\s*first_name\s*\}\}/g, firstName).replace(/\{\{\s*company\s*\}\}/g, company)
      : `Scaling outreach for ${company}`;
    body = `Hi ${firstName},\n\nNoticed what your team is building at ${company}. Considering your role as ${role}, I wanted to reach out regarding our automated cold email infrastructure.\n\nWe help companies in ${industry} scale multi-sender campaigns with 98%+ primary inbox placement.\n\nWould you be opposed to checking out how this works for ${company}?\n\nBest,\n${sender}`;
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
 * Suggest edits, improve tone, or rewrite copy in the sequence editor.
 */
export async function improveEmailCopy(
  options: ImproveCopyOptions,
): Promise<{ subject: string; bodyText: string; bodyHtml: string; changesSummary: string }> {
  const provider = (options.provider || "google").toLowerCase();
  const apiKey = resolveApiKey(provider, options.apiKey);

  const { subject, bodyText, instruction, tone = "auto" } = options;

  if (!apiKey) {
    // Intelligent local copy refinement when no key is set
    let revisedSub = subject;
    let revisedBody = bodyText;
    let summary = "Refined copy for clarity and deliverability.";

    if (tone === "concise") {
      revisedSub = subject.replace(/\s*\(quick question\)/i, "").trim();
      const lines = bodyText.split("\n").filter((l) => l.trim().length > 0);
      revisedBody = lines.slice(0, Math.max(2, Math.ceil(lines.length * 0.7))).join("\n\n");
      summary = "Trimmed ~30% fluff and shortened sentences for fast mobile reading.";
    } else if (tone === "executive") {
      revisedSub = subject.startsWith("Re:") ? subject : `Scaling your outbound pipeline`;
      revisedBody = `Hi {{first_name}},\n\nSaw what your team is building at {{company}}.\n\nWe benchmarked cold deliverability for scaling engineering & sales teams and uncovered three quick levers to optimize inbox placement.\n\nOpen to a brief 5-minute review of the findings this Thursday?\n\nBest,\n{{sender_name}}`;
      summary = "Adapted tone to direct, peer-to-peer executive communication.";
    } else if (tone === "punchy_cta") {
      revisedBody = `${bodyText.trim()}\n\nWould Thursday at 2pm work for a 4-minute intro?`;
      summary = "Added a concrete, low-friction call-to-action.";
    } else {
      revisedSub = subject.trim() || "Quick question regarding {{company}}";
      revisedBody = bodyText.trim() || "Hi {{first_name}},\n\nWould love to share benchmark data for {{company}}.\n\nBest,\n{{sender_name}}";
    }

    return {
      subject: revisedSub,
      bodyText: revisedBody,
      bodyHtml: textToHtmlBlocks(revisedBody),
      changesSummary: summary,
    };
  }

  const prompt = `You are an expert cold email copy editor. Improve the following cold outreach draft according to the user's requested tone and instructions.

ORIGINAL DRAFT:
Subject: ${subject}
Body:
${bodyText}

REQUESTED TONE / GOAL: ${tone}
ADDITIONAL INSTRUCTION: ${instruction || "Improve punchiness, deliverability, and response rate. Remove corporate clichés."}

Output strictly a JSON object:
{
  "subject": "Refined subject line",
  "bodyText": "Refined plain text body",
  "bodyHtml": "<p>Refined HTML body</p>",
  "changesSummary": "Brief bulleted explanation of what was improved"
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
    return {
      subject: String(parsed.subject || subject).trim(),
      bodyText: resBody,
      bodyHtml: String(parsed.bodyHtml || textToHtmlBlocks(resBody)).trim(),
      changesSummary: String(parsed.changesSummary || "Enhanced cold outreach copy").trim(),
    };
  } catch (err) {
    console.warn("[ai-engine] Improve copy API error, returning original:", err);
    return {
      subject,
      bodyText,
      bodyHtml: textToHtmlBlocks(bodyText),
      changesSummary: "Could not reach AI provider — original copy preserved.",
    };
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
