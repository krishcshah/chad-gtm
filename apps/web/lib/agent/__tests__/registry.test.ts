import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ToolRegistry,
  ToolTimeoutError,
  ToolValidationError,
} from "../registry";
import { sanitizeForTrace } from "../trace";
import type { AgentContext } from "../types";

const ctx = {
  run: {} as any,
  step: {} as any,
  userId: "u1",
  workspaceId: "w1",
  state: {},
  db: {},
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
} satisfies AgentContext;

describe("ToolRegistry", () => {
  it("rejects invalid input before execution", async () => {
    let ran = false;
    const registry = new ToolRegistry().register({
      name: "echo",
      description: "echo",
      inputSchema: z.object({ value: z.number() }),
      outputSchema: z.object({ value: z.number() }),
      async run() {
        ran = true;
        return { value: 1 };
      },
    });

    await expect(registry.execute("echo", { value: "nope" }, ctx)).rejects.toBeInstanceOf(
      ToolValidationError
    );
    expect(ran).toBe(false);
  });

  it("times out a slow tool", async () => {
    const registry = new ToolRegistry().register({
      name: "slow",
      description: "slow",
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      timeoutMs: 10,
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: true };
      },
    });

    await expect(registry.execute("slow", {}, ctx)).rejects.toBeInstanceOf(ToolTimeoutError);
  });

  it("rejects invalid tool output", async () => {
    const registry = new ToolRegistry().register({
      name: "bad-output",
      description: "bad",
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      async run() {
        return { ok: "yes" } as any;
      },
    });

    await expect(registry.execute("bad-output", {}, ctx)).rejects.toBeInstanceOf(
      ToolValidationError
    );
  });
});

describe("sanitizeForTrace", () => {
  it("redacts secrets and truncates large strings", () => {
    const result = sanitizeForTrace(
      {
        email: "a@b.com",
        password: "hunter2",
        nested: { apiKey: "secret", token: "secret2" },
        body: "x".repeat(100),
      },
      { maxString: 20 }
    ) as any;

    expect(result.password).toBe("[redacted]");
    expect(result.nested.apiKey).toBe("[redacted]");
    expect(result.nested.token).toBe("[redacted]");
    expect(result.body).toContain("[truncated");
    expect(result.email).toBe("a@b.com");
  });

  it("bounds arrays", () => {
    const result = sanitizeForTrace({ items: [1, 2, 3, 4, 5] }, { maxArray: 2 }) as any;
    expect(result.items).toHaveLength(3);
    expect(result.items[2]).toContain("more items");
  });
});
