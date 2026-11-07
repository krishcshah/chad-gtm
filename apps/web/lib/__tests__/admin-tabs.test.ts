import { describe, expect, it } from "vitest";
import { ADMIN_TABS, adminTabSupportCategory, parseAdminTab } from "@/app/(app)/admin/admin-tabs";

describe("parseAdminTab", () => {
  it("sends old Bug reports links to Support", () => {
    expect(parseAdminTab("bugs")).toBe("support");
    expect(parseAdminTab("bug-reports")).toBe("support");
    expect(parseAdminTab("Bugs")).toBe("support");
  });

  it("keeps the mailbox pool tab and its alias", () => {
    expect(parseAdminTab("mailboxes")).toBe("mailboxes");
    expect(parseAdminTab("pool")).toBe("mailboxes");
  });

  it("falls back to approvals for missing or unknown values", () => {
    expect(parseAdminTab(undefined)).toBe("approvals");
    expect(parseAdminTab(null)).toBe("approvals");
    expect(parseAdminTab("")).toBe("approvals");
    expect(parseAdminTab("nope")).toBe("approvals");
  });

  it("no longer has a separate Bug reports tab", () => {
    expect(ADMIN_TABS as readonly string[]).not.toContain("bugs");
    expect(ADMIN_TABS).toContain("support");
  });
});

describe("adminTabSupportCategory", () => {
  it("filters Support to bugs for old Bug reports links", () => {
    expect(adminTabSupportCategory("bugs")).toBe("bug_report");
    expect(adminTabSupportCategory("Bug-Reports")).toBe("bug_report");
    expect(adminTabSupportCategory("bug_report")).toBe("bug_report");
  });

  it("returns null for every other tab", () => {
    expect(adminTabSupportCategory("support")).toBeNull();
    expect(adminTabSupportCategory(undefined)).toBeNull();
    expect(adminTabSupportCategory(null)).toBeNull();
    expect(adminTabSupportCategory("mailboxes")).toBeNull();
  });
});
