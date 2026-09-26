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
    name: "High-Conversion B2B SaaS Outreach",
    description: "3-step value-first sequence proven to generate 18%+ reply rates for software & tech.",
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
            subject: "Quick question regarding {{company}}'s outreach stack",
            bodyText:
              "Hi {{first_name}},\n\nI was looking at {{company}} and noticed you're scaling outreach this quarter. Most founders I speak with struggle with mailbox deliverability and high tool costs.\n\nWe built an automated system that handles sender rotation and humanized pacing without monthly seat caps.\n\nWorth a 4-minute chat this Thursday?",
            bodyHtml: "",
          },
          {
            label: "B",
            subject: "Scaling {{company}}'s cold email infrastructure (quick question)",
            bodyText:
              "Hey {{first_name}},\n\nSaw what your team is building at {{company}}—stellar momentum.\n\nCurious if you've run into deliverability bottlenecks or domain burn lately? We built an open infrastructure that gives you unlimited rotating mailboxes without the $1,000s/mo price gouging.\n\nOpen to exploring if this could optimize your pipeline?",
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
            subject: "Re: Quick question regarding {{company}}'s outreach stack",
            bodyText:
              "Hey {{first_name}},\n\nFollowing up on my note from Tuesday. Did you have a moment to review this?\n\nHappy to share a quick 60-second video of how our deliverability pipeline compares to Instantly or Smartlead.\n\nBest,\n{{sender_name}}",
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
            subject: "Re: Quick question regarding {{company}}'s outreach stack",
            bodyText:
              "Hi {{first_name}},\n\nI assume your calendar is fully booked right now—completely understand.\n\nIf you ever look into optimizing {{company}}'s cold email infrastructure down the line, feel free to reach back out.\n\nCheers,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
    ],
  },
  {
    id: "preset-agency-client-audit",
    name: "Agency Client Acquisition Multi-Touch",
    description: "4-step sequence featuring an observation, personalized audit, and soft CTA.",
    stepsCount: 4,
    isPreset: true,
    steps: [
      {
        key: "step-1",
        stepNumber: 1,
        delayDays: 0,
        variants: [
          {
            label: "A",
            subject: "Ideas for {{company}}'s inbound conversion rate",
            bodyText:
              "Hey {{first_name}},\n\nTook a look at {{company}}'s landing page earlier today. Noticed 2 quick UX tweaks you could implement to improve lead capture.\n\nMind if I send over a quick 2-minute Loom video breaking them down?",
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
            subject: "Re: Ideas for {{company}}'s inbound conversion rate",
            bodyText:
              "Hi {{first_name}},\n\nRecorded the video breakdown—would you prefer I send the link here or to another email?\n\nNo pitch or obligation at all, just thought it might be helpful for {{company}}.",
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
            subject: "Re: Ideas for {{company}}'s inbound conversion rate",
            bodyText:
              "Hey {{first_name}},\n\nWanted to make sure this didn't get buried. Just let me know if you'd like to take a look.\n\nThanks,\n{{sender_name}}",
            bodyHtml: "",
          },
        ],
      },
      {
        key: "step-4",
        stepNumber: 4,
        delayDays: 5,
        variants: [
          {
            label: "A",
            subject: "Permission to close file?",
            bodyText:
              "Hi {{first_name}},\n\nI haven't heard back so I'll assume this isn't a priority for {{company}} right now.\n\nShould I archive this thread, or would next month be better to circle back?",
            bodyHtml: "",
          },
        ],
      },
    ],
  },
  {
    id: "preset-founder-intro",
    name: "Founder-to-Founder Lightweight Intro",
    description: "2-step ultra-short, natural outreach for executive and C-level networking.",
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
            subject: "Connecting with {{first_name}} @ {{company}}",
            bodyText:
              "Hi {{first_name}},\n\nFollowing your work with {{company}}. Are you currently taking on new growth initiatives this quarter?\n\nWould love to connect briefly if open.\n\nBest,\n{{sender_name}}",
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
            subject: "Re: Connecting with {{first_name}} @ {{company}}",
            bodyText:
              "Hey {{first_name}}—following up on this quickly. Any interest in a brief 5-min intro?\n\nBest,\n{{sender_name}}",
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
