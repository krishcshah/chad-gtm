export interface AiModelDefinition {
  id: string;
  name: string;
  provider: "google" | "openai";
  badge?: string;
  description: string;
  recommended?: boolean;
}

export const SUPPORTED_AI_MODELS: AiModelDefinition[] = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "google",
    badge: "Latest Sept 2026",
    description: "Google's newest frontier Flash model. Elite speed, 1M context, superior personalization.",
    recommended: true,
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    provider: "google",
    badge: "Ultra Fast",
    description: "Lowest latency and highest throughput for massive outbound volume.",
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "google",
    badge: "Agentic Workflows",
    description: "High-speed multi-step agentic writing and structured copy.",
  },
  {
    id: "gpt-5.6",
    name: "GPT-5.6 (Flagship)",
    provider: "openai",
    badge: "Latest Frontier",
    description: "OpenAI's latest flagship model with advanced reasoning and nuanced tone.",
    recommended: true,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    badge: "Fast & Efficient",
    description: "Next-gen compact model optimized for rapid email generation.",
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    badge: "Multimodal Agentic",
    description: "Unified flagship agentic intelligence for cold outreach.",
  },
  {
    id: "o1",
    name: "OpenAI o1",
    provider: "openai",
    badge: "Deep Reasoning",
    description: "Autonomous internal chain-of-thought deliberation for high-stakes enterprise sales.",
  },
];

export const DEFAULT_AI_MODELS = {
  google: "gemini-3.8-flash",
  openai: "gpt-5-mini",
} as const;
