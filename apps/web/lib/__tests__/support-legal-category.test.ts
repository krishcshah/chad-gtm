import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { TICKET_CATEGORIES } from "../support-types";
import { TICKET_CATEGORY_META } from "../../components/support/ticket-category-badge";

const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("Legal / DPA support category", () => {
  it("is a ticket category", () => {
    const legal = TICKET_CATEGORIES.find((c) => c.id === "legal");
    expect(legal?.label).toBe("Legal / DPA");
  });

  it("every category has a label and description", () => {
    for (const c of TICKET_CATEGORIES) {
      expect(TICKET_CATEGORY_META[c.id]?.label, c.id).toBeTruthy();
      expect(TICKET_CATEGORY_META[c.id]?.description, c.id).toBeTruthy();
    }
  });

  it("no page sends privacy or DPA requests to the old anonymous alias", () => {
    const offenders = sourceFiles(join(ROOT, "app")).filter((f) => /@duck\.com/i.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
