import { describe, expect, it } from "vitest";
import {
  POOL_SENDER_NOT_ALLOWED_ERROR,
  SENDER_NOT_OWNED_ERROR,
  campaignSendersStartError,
  partitionCampaignSenders,
  senderPartitionError,
  type CampaignSenderRef,
} from "../campaign-sender-policy";

const own: CampaignSenderRef = { id: "own", userId: "u1", isSystemPool: false };
const own2: CampaignSenderRef = { id: "own2", userId: "u1", isSystemPool: false };
const pool: CampaignSenderRef = { id: "pool", userId: "admin", isSystemPool: true };
const other: CampaignSenderRef = { id: "other", userId: "u2", isSystemPool: false };
const deleted: CampaignSenderRef = { id: "gone", userId: "u1", isSystemPool: false, deletedAt: "2026-01-01" };
const all = [own, own2, pool, other, deleted];

describe("partitionCampaignSenders", () => {
  it("lets a user attach only their own mailboxes", () => {
    const p = partitionCampaignSenders({ senderIds: ["own", "own2"], senders: all, userId: "u1", isAdmin: false });
    expect(p.allowed).toEqual(["own", "own2"]);
    expect(p.rejected).toEqual([]);
    expect(senderPartitionError(p)).toBeNull();
  });

  it("rejects pool mailboxes on a manual campaign for non-admins", () => {
    const p = partitionCampaignSenders({ senderIds: ["own", "pool"], senders: all, userId: "u1", isAdmin: false });
    expect(p.allowed).toEqual(["own"]);
    expect(p.rejected).toEqual([{ id: "pool", reason: "pool" }]);
    expect(senderPartitionError(p)).toBe(POOL_SENDER_NOT_ALLOWED_ERROR);
  });

  it("rejects other users' and deleted or unknown mailboxes", () => {
    const p = partitionCampaignSenders({
      senderIds: ["other", "gone", "nope"],
      senders: all,
      userId: "u1",
      isAdmin: false,
    });
    expect(p.allowed).toEqual([]);
    expect(p.rejected.map((r) => r.reason)).toEqual(["not_owned", "missing", "missing"]);
    expect(senderPartitionError(p)).toBe(SENDER_NOT_OWNED_ERROR);
  });

  it("keeps pool mailboxes already on an autopilot campaign, but never adds new ones", () => {
    const pool2: CampaignSenderRef = { id: "pool2", userId: "admin", isSystemPool: true };
    const p = partitionCampaignSenders({
      senderIds: ["pool", "pool2", "own"],
      senders: [...all, pool2],
      userId: "u1",
      isAdmin: false,
      keepPoolIds: new Set(["pool"]),
    });
    expect(p.allowed).toEqual(["pool", "own"]);
    expect(p.rejected).toEqual([{ id: "pool2", reason: "pool" }]);
  });

  it("lets admins attach their own and pool mailboxes", () => {
    const p = partitionCampaignSenders({ senderIds: ["pool", "other"], senders: all, userId: "admin", isAdmin: true });
    expect(p.allowed).toEqual(["pool"]);
    expect(p.rejected).toEqual([{ id: "other", reason: "not_owned" }]);
  });

  it("drops duplicates and non-string ids", () => {
    const p = partitionCampaignSenders({
      senderIds: ["own", "own", "" as string, 5 as unknown as string],
      senders: all,
      userId: "u1",
      isAdmin: false,
    });
    expect(p.allowed).toEqual(["own"]);
    expect(p.rejected).toEqual([]);
  });

  it("strips pool mailboxes when a user duplicates an autopilot campaign", () => {
    // Duplicate copies exactly the allowed list of the source's attached senders.
    const attached = [pool, own];
    const copy = partitionCampaignSenders({
      senderIds: attached.map((s) => s.id),
      senders: attached,
      userId: "u1",
      isAdmin: false,
    }).allowed;
    expect(copy).toEqual(["own"]);
  });
});

describe("campaignSendersStartError", () => {
  it("blocks a non-admin from sending a manual campaign through pool mailboxes", () => {
    expect(
      campaignSendersStartError({ attached: [own, pool], ownerId: "u1", actorIsAdmin: false, isAutopilotCampaign: false }),
    ).toBe(POOL_SENDER_NOT_ALLOWED_ERROR);
  });

  it("allows pool mailboxes on the autopilot campaign they belong to", () => {
    expect(
      campaignSendersStartError({ attached: [pool], ownerId: "u1", actorIsAdmin: false, isAutopilotCampaign: true }),
    ).toBeNull();
  });

  it("blocks someone else's private mailbox", () => {
    expect(
      campaignSendersStartError({ attached: [other], ownerId: "u1", actorIsAdmin: false, isAutopilotCampaign: true }),
    ).toBe(SENDER_NOT_OWNED_ERROR);
  });

  it("allows own mailboxes and admin actors", () => {
    expect(
      campaignSendersStartError({ attached: [own, own2], ownerId: "u1", actorIsAdmin: false, isAutopilotCampaign: false }),
    ).toBeNull();
    expect(
      campaignSendersStartError({ attached: [pool, other], ownerId: "u1", actorIsAdmin: true, isAutopilotCampaign: false }),
    ).toBeNull();
  });
});
