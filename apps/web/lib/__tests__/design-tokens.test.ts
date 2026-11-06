import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The UI uses semantic tokens only (docs/DESIGN.md). Raw Tailwind palette
 * classes, black/white and hex colours in class names break the light and
 * dark themes, so they are not allowed in app/ and components/.
 */
const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "components", join("..", "..", "packages", "ui", "src")];

const PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}";
const UTIL =
  "(?:bg|text|border|ring|ring-offset|from|via|to|fill|stroke|outline|divide|shadow|decoration|placeholder|caret|accent)";
const RAW_PALETTE = new RegExp(`\\b${UTIL}-${PALETTE}\\b`);
const BLACK_WHITE = new RegExp(`\\b${UTIL}-(?:black|white)\\b`);
const HEX_IN_CLASS = /\b(?:bg|text|border|ring|from|via|to|fill|stroke|shadow)-\[#[0-9a-fA-F]{3,8}\]/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx|ts)$/.test(name)) yield p;
  }
}

describe("design tokens", () => {
  it("app and components use semantic colour tokens only", () => {
    const offenders: string[] = [];
    for (const d of DIRS) {
      for (const f of files(join(ROOT, d))) {
        const lines = readFileSync(f, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (line.includes("design-tokens-allow")) return;
          const m = line.match(RAW_PALETTE) ?? line.match(BLACK_WHITE) ?? line.match(HEX_IN_CLASS);
          if (m) offenders.push(`${relative(ROOT, f)}:${i + 1}  ${m[0]}`);
        });
      }
    }
    expect(offenders, `Use tokens from docs/DESIGN.md instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
