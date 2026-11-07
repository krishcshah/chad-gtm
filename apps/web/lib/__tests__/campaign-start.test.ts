/**
 * #18: one "can this campaign start" check for Start/Resume on Campaigns and
 * Resume on Autopilot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  approved: true,
  identity: { companyName: "Acme Inc.", postalAddress: "1 Main St, Springfield, IL 62701" },
}));

vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "Your account is waiting for approval.",
  assertCanSend: vi.fn(async (userId: string) => {
    if (!state.approved) throw new Error(`Your account is waiting for approval. (${userId})`);
  }),
}));
vi.mock("../gtm-launch", () => ({
  loadComplianceIdentity: vi.fn(async () => state.identity),
}));

import { assertCanSend } from "../approval";
import { CAMPAIGN_POSTAL_REQUIRED_ERROR } from "../campaign-start-guard";
import { POOL_SENDER_NOT_ALLOWED_ERROR } from "../campaign-sender-policy";
import { CAMPAIGN_MISSING_LIST_ERROR, CAMPAIGN_NOT_FOUND_ERROR, campaignStartError } from "../campaign-start";

/** Selects resolve in order: campaign, attached senders, autopilot run. */
function fakeDb(selects: any[][]) {
  const chain = (rows: any[]) => {
    const c: any = {};
    for (const m of ["from", "where", "innerJoin", "limit"]) c[m] = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };
  return { select: vi.fn(() => chain(selects.shift() ?? [])) } as any;
}

const CAMPAIGN = { id: "c1", userId: "owner-1", leadListId: "list-1" };
const OWN_SENDER = { id: "s1", userId: "owner-1", isSystemPool: false, deletedAt: null };
const actor = { id: "owner-1", isAdmin: false };

beforeEach(() => {
  state.approved = true;
  state.identity = { companyName: "Acme Inc.", postalAddress: "1 Main St, Springfield, IL 62701" };
  vi.mocked(assertCanSend).mockClear();
});

describe("campaignStartError", () => {
  it("is null when everything is in place", async () => {
    expect(await campaignStartError(fakeDb([[CAMPAIGN], [OWN_SENDER], []]), { campaignId: "c1", actor })).toBeNull();
  });

  it("refuses a missing or deleted campaign", async () => {
    expect(await campaignStartError(fakeDb([[]]), { campaignId: "c1", actor })).toBe(CAMPAIGN_NOT_FOUND_ERROR);
  });

  it("refuses a campaign without a lead list", async () => {
    const db = fakeDb([[{ ...CAMPAIGN, leadListId: null }]]);
    expect(await campaignStartError(db, { campaignId: "c1", actor })).toBe(CAMPAIGN_MISSING_LIST_ERROR);
  });

  it("checks the OWNER's approval, also when an admin starts it", async () => {
    state.approved = false;
    const r = await campaignStartError(fakeDb([[CAMPAIGN]]), { campaignId: "c1", actor: { id: "admin", isAdmin: true } });
    expect(r).toMatch(/waiting for approval/);
    expect(assertCanSend).toHaveBeenCalledWith("owner-1");
  });

  it("refuses a weak postal address or a blank company name", async () => {
    state.identity = { companyName: "Acme Inc.", postalAddress: "1 Main St" };
    expect(await campaignStartError(fakeDb([[CAMPAIGN]]), { campaignId: "c1", actor })).toBe(
      CAMPAIGN_POSTAL_REQUIRED_ERROR,
    );
    state.identity = { companyName: "", postalAddress: "1 Main St, Springfield, IL 62701" };
    expect(await campaignStartError(fakeDb([[CAMPAIGN]]), { campaignId: "c1", actor })).toBe(
      CAMPAIGN_POSTAL_REQUIRED_ERROR,
    );
  });

  it("checks the sender identity of the campaign's own workspace (#72)", async () => {
    const { loadComplianceIdentity } = await import("../gtm-launch");
    vi.mocked(loadComplianceIdentity).mockClear();
    await campaignStartError(fakeDb([[{ ...CAMPAIGN, workspaceId: "w-b" }], [OWN_SENDER], []]), { campaignId: "c1", actor });
    expect(loadComplianceIdentity).toHaveBeenCalledWith(expect.anything(), "owner-1", "w-b");
    await campaignStartError(fakeDb([[CAMPAIGN], [OWN_SENDER], []]), { campaignId: "c1", actor });
    expect(loadComplianceIdentity).toHaveBeenLastCalledWith(expect.anything(), "owner-1", null);
  });

  it("refuses pool mailboxes on a manual campaign", async () => {
    const poolSender = { id: "p1", userId: "admin", isSystemPool: true, deletedAt: null };
    const db = fakeDb([[CAMPAIGN], [poolSender], []]);
    expect(await campaignStartError(db, { campaignId: "c1", actor })).toBe(POOL_SENDER_NOT_ALLOWED_ERROR);
  });
});
