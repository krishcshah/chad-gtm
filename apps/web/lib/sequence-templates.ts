export interface TemplateVariantItem {
  label: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  aiGenerateOnTheFly?: boolean;
  aiPrompt?: string;
}

export interface TemplateStepItem {
  key?: string;
  stepNumber?: number;
  delayDays: number;
  variants: TemplateVariantItem[];
}

export interface ReusableSequence {
  id: string;
  name: string;
  description: string;
  stepsCount: number;
  steps: TemplateStepItem[];
  isPreset?: boolean;
}

export const PRESET_SEQUENCES: ReusableSequence[] = [
  {
    id: "preset-b2b-saas",
    name: "Top 0.001% B2B Pipeline & Deliverability",
    description: "3-step modern sequence built on Lavender & Gong benchmarks (under 55 words, interest-based CTA).",
    stepsCount: 3,
    isPreset: true,
    steps: [
      {
        key: "step-1",
        stepNumber: 1,
        delayDays: 0,
        variants: [
          {
            label: "A",
            subject: "outbound deliverability",
            bodyText:
              "Hey {{first_name}},\n\nNoticed how many outbound teams in your space are battling domain burn and secondary mailbox limits right now.\n\nUpdated sender caps quietly shove cold emails into spam once a single inbox exceeds 35 sends a day.\n\nWe set up rotating warmup-protected mailboxes with peer-to-peer personalization to keep primary domain reputation at 99%.\n\nWorth exploring if I send over our 1-page deliverability checklist?",
            bodyHtml: "",
          },
          {
            label: "B",
            subject: "pipeline scaling",
            bodyText:
              "Hey {{first_name}},\n\nScaling cold pipeline at {{company}} usually hits a wall when SDRs spend 20 hours a week researching accounts manually.\n\nWe built an engine that researches accounts and drafts hyper-relevant touchpoints at 10x speed with zero domain burn.\n\nOpen to seeing a 2-minute benchmark breakdown comparing reply rates?",
            bodyHtml: "",
          },
        ],
      },
      {
        key: "step-2",
        stepNumber: 2,
        delayDays: 3,
        variants: [
          {
            label: "A",
            subject: "re: outbound deliverability",
            bodyText:
              "Hey {{first_name}},\n\nPut together a 60-second video comparing mailbox deliverability benchmarks across modern providers.\n\nWould you prefer I share the link here or send it to another email?\n\nBest,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
      {
        key: "step-3",
        stepNumber: 3,
        delayDays: 4,
        variants: [
          {
            label: "A",
            subject: "re: outbound deliverability",
            bodyText:
              "Hi {{first_name}},\n\nAssuming you're heads-down scaling {{company}} right now and this isn't a priority.\n\nShould I close your file for now, or check back with you in Q3?\n\nBest,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
    ],
  },
  {
    id: "preset-agency-client-audit",
    name: "Conversion & UX Audit (Local / Agency)",
    description: "3-step visual teardown sequence proven to generate 22%+ reply rates for agencies & studios.",
    stepsCount: 3,
    isPreset: true,
    steps: [
      {
        key: "step-1",
        stepNumber: 1,
        delayDays: 0,
        variants: [
          {
            label: "A",
            subject: "website mobile speed",
            bodyText:
              "Hey {{first_name}},\n\nLooked at {{company}}'s site on mobile earlier today.\n\nNoticed the quote request form sits behind a 4-second layout delay, which usually costs local businesses 30% of their mobile traffic.\n\nWe recently rebuilt a peer site in your space, cutting load times to 0.5s and doubling form completions without touching ad spend.\n\nPut together a 60-second video teardown showing where the drop-offs happen. Mind if I share it here?",
            bodyHtml: "",
          },
        ],
      },
      {
        key: "step-2",
        stepNumber: 2,
        delayDays: 3,
        variants: [
          {
            label: "A",
            subject: "re: website mobile speed",
            bodyText:
              "Hey {{first_name}},\n\nRecorded the 60-second teardown for {{company}} showing the two mobile form shifts that are likely leaking quotes.\n\nWould you prefer I share the link here, or is there a better email for you?\n\nBest,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
      {
        key: "step-3",
        stepNumber: 3,
        delayDays: 4,
        variants: [
          {
            label: "A",
            subject: "re: website mobile speed",
            bodyText:
              "Hi {{first_name}},\n\nAssuming you're heads-down right now and website conversion isn't a priority.\n\nShould I close your file for now, or check back with you in Q3?\n\nBest,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
    ],
  },
  {
    id: "preset-founder-intro",
    name: "Peer-to-Peer Executive Diagnostic",
    description: "2-step ultra-short, non-salesy outreach for founders and C-level decision-makers.",
    stepsCount: 2,
    isPreset: true,
    steps: [
      {
        key: "step-1",
        stepNumber: 1,
        delayDays: 0,
        variants: [
          {
            label: "A",
            subject: "{{company}} priorities",
            bodyText:
              "Hi {{first_name}},\n\nFocusing on operational throughput at {{company}}.\n\nWe benchmarked execution bottlenecks across your industry, uncovering two levers to cut manual handoffs by half.\n\nOpen to a brief 60-second look at the breakdown?\n\nBest,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
      {
        key: "step-2",
        stepNumber: 2,
        delayDays: 4,
        variants: [
          {
            label: "A",
            subject: "re: {{company}} priorities",
            bodyText:
              "Hi {{first_name}},\n\nAssuming you're heads-down right now.\n\nShould I close this out or check back in Q3?\n\nBest,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
    ],
  },
];

export function isSequenceTemplate(bodyText: string | null | undefined): boolean {
  if (!bodyText) return false;
  return bodyText.startsWith('{"__isSequence":true');
}

export function parseSequenceTemplate(tpl: {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): ReusableSequence {
  try {
    if (isSequenceTemplate(tpl.bodyText)) {
      const parsed = JSON.parse(tpl.bodyText);
      return {
        id: tpl.id,
        name: tpl.name || parsed.name || "Untitled Sequence",
        description: parsed.description || `${parsed.steps?.length || 1}-step automated sequence`,
        stepsCount: parsed.steps?.length || 1,
        steps: parsed.steps || [],
        isPreset: false,
      };
    }
  } catch {
    // fallback to 1-step sequence
  }

  // Treat legacy single templates as 1-step sequences
  return {
    id: tpl.id,
    name: tpl.name || "Untitled Sequence",
    description: "1-step outreach sequence",
    stepsCount: 1,
    steps: [
      {
        key: "step-1",
        stepNumber: 1,
        delayDays: 0,
        variants: [
          {
            label: "A",
            subject: tpl.subject || "Quick question",
            bodyText: tpl.bodyText || "",
            bodyHtml: tpl.bodyHtml || "",
          },
        ],
      },
    ],
    isPreset: false,
  };
}

export function serializeSequenceTemplate(
  name: string,
  description: string,
  steps: TemplateStepItem[]
): string {
  return JSON.stringify({
    __isSequence: true,
    name,
    description,
    steps,
  });
}
