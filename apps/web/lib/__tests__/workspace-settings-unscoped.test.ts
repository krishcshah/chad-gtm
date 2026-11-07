import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The account's workspace_settings row must not be tied to a workspace:
 * deleting that workspace used to take the postal address and AI settings
 * with it. No server code may write workspace_settings.workspace_id.
 */
const webRoot = path.resolve(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Each `.insert(schema.workspaceSettings)` / `.update(...)` call chain, up to the end of its statement. */
function writeChains(src: string): string[] {
  const chains: string[] = [];
  const re = /\.(insert|update)\(\s*schema\.workspaceSettings\s*\)/g;
  for (const m of src.matchAll(re)) {
    const start = m.index ?? 0;
    const end = src.indexOf(";", start);
    chains.push(src.slice(start, end === -1 ? undefined : end));
  }
  return chains;
}

describe("workspace_settings writes", () => {
  it("never set workspace_id", () => {
    const offenders: string[] = [];
    for (const dir of ["lib", "app"]) {
      for (const file of sourceFiles(path.join(webRoot, dir))) {
        const src = readFileSync(file, "utf8");
        for (const chain of writeChains(src)) {
          if (/\bworkspaceId\b/.test(chain)) offenders.push(path.relative(webRoot, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds the writes it checks", () => {
    const sample = `await db.insert(schema.workspaceSettings).values({ userId, workspaceId: w.id });`;
    expect(writeChains(sample)).toHaveLength(1);
    expect(/\bworkspaceId\b/.test(writeChains(sample)[0])).toBe(true);
  });
});
