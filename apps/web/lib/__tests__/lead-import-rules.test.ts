import { describe, expect, it } from "vitest";
import { classifyImportEmail, directoryRowsToLeadValues } from "../lead-import-rules";

/* #43: CSV import skips blocked addresses (and says so) and treats deleted
 * leads as gone. #45: directory saves land in the right workspace with
 * lowercased emails and count only real additions. */

describe("classifyImportEmail", () => {
  const sets = (over: { existing?: string[]; seen?: string[]; blocked?: string[] } = {}) => ({
    existing: new Set(over.existing ?? []),
    seen: new Set(over.seen ?? []),
    blocked: new Set(over.blocked ?? []),
  });

  it("an email in the blocked set is 'blocked'", () => {
    expect(classifyImportEmail("dana@acme.com", sets({ blocked: ["dana@acme.com"] }))).toBe("blocked");
  });

  it("an email only on a soft-deleted lead (not in existing) is 'ok'", () => {
    // The caller loads active rows only, so a deleted lead's email is absent.
    expect(classifyImportEmail("old@acme.com", sets({ existing: ["other@acme.com"] }))).toBe("ok");
  });

  it("an email already on the list, or repeated in the batch, is 'duplicate'", () => {
    expect(classifyImportEmail("a@acme.com", sets({ existing: ["a@acme.com"] }))).toBe("duplicate");
    expect(classifyImportEmail("a@acme.com", sets({ seen: ["a@acme.com"] }))).toBe("duplicate");
  });

  it("a malformed or empty email is 'invalid'", () => {
    for (const bad of ["", "not-an-email", "a@b", "a b@acme.com", "@acme.com"]) {
      expect(classifyImportEmail(bad, sets())).toBe("invalid");
    }
  });

  it("a duplicate that is also blocked counts as a duplicate (it was never going to be added)", () => {
    expect(classifyImportEmail("a@acme.com", sets({ existing: ["a@acme.com"], blocked: ["a@acme.com"] }))).toBe(
      "duplicate",
    );
  });
});

describe("directoryRowsToLeadValues", () => {
  it("lowercases, drops existing / repeated / suppressed rows, sets workspaceId and reports skipped", () => {
    const { values, skipped } = directoryRowsToLeadValues(
      [
        { email: "John@Acme.com", first_name: "John", company_name: "Acme" },
        { email: "already@acme.com" },
        { email: "john@acme.com", first_name: "Johnny" },
        { email: "Blocked@Acme.com" },
        { email: "" },
      ],
      {
        userId: "u1",
        workspaceId: "w2",
        listId: "list1",
        existing: new Set(["already@acme.com"]),
        suppressed: new Set(["blocked@acme.com"]),
      },
    );
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      userId: "u1",
      workspaceId: "w2",
      listId: "list1",
      email: "john@acme.com",
      firstName: "John",
      company: "Acme",
    });
    expect(skipped).toBe(3);
  });

  it("keeps raw_data and the extra emails in customFields, and survives bad raw_data", () => {
    const { values } = directoryRowsToLeadValues(
      [
        { email: "a@acme.com", raw_data: '{"seniority":"vp"}', work_email: "a@work.acme.com" },
        { email: "b@acme.com", raw_data: "{not json" },
      ],
      { userId: "u1", workspaceId: "w1", listId: "l1", existing: new Set(), suppressed: new Set() },
    );
    expect(values[0].customFields).toEqual({ seniority: "vp", work_email: "a@work.acme.com" });
    expect(values[1].customFields).toEqual({});
  });
});
