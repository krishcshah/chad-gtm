import { afterEach, describe, expect, it, vi } from "vitest";

/* #80: AutoGTM manages the model. A stored per-user key, provider or model
 * is ignored; web and engine share one resolver. */

const dbSelect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("getWorkspaceAiOptions must not read the database");
  }),
);
vi.mock("../db", () => ({ getDb: () => ({ select: dbSelect }), ensureAiColumns: vi.fn() }));

import { getWorkspaceAiOptions } from "../ai";
import { systemAiOptions } from "@smartreach/email-engine/ai-options";

const env = process.env as Record<string, string | undefined>;
const saved = { gemini: env.GEMINI_API_KEY, google: env.GOOGLE_API_KEY, openai: env.OPENAI_API_KEY };
afterEach(() => {
  for (const [k, v] of [
    ["GEMINI_API_KEY", saved.gemini],
    ["GOOGLE_API_KEY", saved.google],
    ["OPENAI_API_KEY", saved.openai],
  ] as const) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

describe("getWorkspaceAiOptions", () => {
  it("returns the managed Gemini options from the environment and never reads the db", async () => {
    env.GEMINI_API_KEY = "sys-gemini";
    env.OPENAI_API_KEY = "sys-openai";
    expect(await getWorkspaceAiOptions("u1")).toEqual({ apiKey: "sys-gemini", provider: "google", model: "gemini-3.8-flash" });
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("uses the managed OpenAI options when only an OpenAI key is configured", async () => {
    delete env.GEMINI_API_KEY;
    delete env.GOOGLE_API_KEY;
    env.OPENAI_API_KEY = "sys-openai";
    expect(await getWorkspaceAiOptions("u1")).toEqual({ apiKey: "sys-openai", provider: "openai", model: "gpt-5-mini" });
  });

  it("is the same resolver the engine uses", async () => {
    env.GEMINI_API_KEY = "sys-gemini";
    expect(await getWorkspaceAiOptions("u2")).toEqual(systemAiOptions());
    expect(dbSelect).not.toHaveBeenCalled();
  });
});
