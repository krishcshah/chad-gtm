import type { AgentContext, ToolDefinition } from "./types";

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown agent tool: ${name}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends Error {
  constructor(name: string, phase: "input" | "output", detail: string) {
    super(`Invalid ${phase} for tool ${name}: ${detail}`);
    this.name = "ToolValidationError";
  }
}

export class ToolTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`Tool ${name} timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

/**
 * Typed tool registry. Every tool call is validated, time-boxed, and
 * output-validated before the runtime persists it.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  registerAll(tools: ToolDefinition[]): this {
    for (const tool of tools) this.register(tool);
    return this;
  }

  get(name: string): ToolDefinition | null {
    return this.tools.get(name) ?? null;
  }

  list(): Array<Pick<ToolDefinition, "name" | "description" | "timeoutMs" | "requiresApproval">> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      timeoutMs: tool.timeoutMs,
      requiresApproval: tool.requiresApproval,
    }));
  }

  async execute(name: string, rawInput: unknown, ctx: AgentContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);

    const parsedInput = tool.inputSchema.safeParse(rawInput ?? {});
    if (!parsedInput.success) {
      throw new ToolValidationError(name, "input", parsedInput.error.message);
    }

    const timeoutMs = tool.timeoutMs ?? 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const output = await Promise.race([
        tool.run(parsedInput.data, ctx),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ToolTimeoutError(name, timeoutMs)), timeoutMs);
        }),
      ]);

      const parsedOutput = tool.outputSchema.safeParse(output);
      if (!parsedOutput.success) {
        throw new ToolValidationError(name, "output", parsedOutput.error.message);
      }
      return parsedOutput.data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
