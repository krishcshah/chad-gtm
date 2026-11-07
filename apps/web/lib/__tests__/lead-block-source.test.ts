import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("../db", () => ({ getDb: vi.fn() }));

import { leadBlockSourceSql } from "../queries";

describe("leadBlockSourceSql (#32)", () => {
  const q = new PgDialect().sqlToQuery(leadBlockSourceSql());

  it("matches the owner's own rows or anyone's global opt-outs", () => {
    expect(q.sql).toContain('"suppressions"."user_id" = "leads"."user_id"');
    expect(q.sql).toContain('"suppressions"."source" in (');
    for (const s of ["unsubscribe", "bounce", "complaint", "erasure"]) expect(q.params).toContain(s);
    expect(q.params).not.toContain("manual");
  });

  it("matches the address or its @domain, and puts global sources first", () => {
    expect(q.sql).toContain('lower("suppressions"."value") = lower("leads"."email")');
    expect(q.sql).toContain(`'@' || split_part(lower("leads"."email"), '@', 2)`);
    expect(q.sql).toMatch(/order by case when "suppressions"\."source" in \([^)]*\) then 0 else 1 end\s+limit 1/);
  });
});
