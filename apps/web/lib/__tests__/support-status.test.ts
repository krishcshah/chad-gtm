import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  customerStatusAction,
  isTicketStatus,
  statusAfterReply,
  ticketStatusChangeError,
} from "../support-status";

const tickets: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
const inserts: Record<string, unknown>[] = [];

function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return b;
}
const db = {
  select: vi.fn(() => builder(tickets)),
  update: vi.fn(() => ({
    set: (values: Record<string, unknown>) => {
      updates.push(values);
      return { where: async () => undefined };
    },
  })),
  insert: vi.fn(() => ({
    values: async (values: Record<string, unknown>) => {
      inserts.push(values);
    },
  })),
};
vi.mock("../db", () => ({ getDb: () => db }));
vi.mock("../admin", () => ({
  isAdmin: (u: { role?: string | null } | null) => u?.role === "admin",
  requireAdmin: () => undefined,
}));

import { addMessageToTicket, updateTicketStatus } from "../support";

const OWNER_ERROR = "You can mark your ticket resolved or reopen it. Support sets the other statuses.";

describe("statusAfterReply", () => {
  it("reopens a resolved or closed ticket when the customer replies", () => {
    expect(statusAfterReply("closed", false)).toBe("open");
    expect(statusAfterReply("resolved", false)).toBe("open");
  });

  it("leaves an open or in-progress ticket alone when the customer replies", () => {
    expect(statusAfterReply("open", false)).toBe("open");
    expect(statusAfterReply("in_progress", false)).toBe("in_progress");
  });

  it("marks an open ticket in progress when support replies", () => {
    expect(statusAfterReply("open", true)).toBe("in_progress");
  });

  it("keeps a closed ticket closed when support replies", () => {
    expect(statusAfterReply("closed", true)).toBe("closed");
    expect(statusAfterReply("resolved", true)).toBe("resolved");
  });
});

describe("customerStatusAction", () => {
  it("offers Mark resolved on open and in-progress tickets", () => {
    expect(customerStatusAction("open")).toEqual({ to: "resolved", label: "Mark resolved" });
    expect(customerStatusAction("in_progress")).toEqual({ to: "resolved", label: "Mark resolved" });
  });

  it("offers Reopen on resolved and closed tickets", () => {
    expect(customerStatusAction("resolved")).toEqual({ to: "open", label: "Reopen" });
    expect(customerStatusAction("closed")).toEqual({ to: "open", label: "Reopen" });
  });
});

describe("ticketStatusChangeError", () => {
  const owner = { isAdmin: false, isOwner: true };

  it("refuses staff-only statuses for the owner", () => {
    expect(ticketStatusChangeError({ ...owner, from: "open", to: "in_progress" })).toBe(OWNER_ERROR);
    expect(ticketStatusChangeError({ ...owner, from: "open", to: "closed" })).toBe(OWNER_ERROR);
    expect(ticketStatusChangeError({ ...owner, from: "resolved", to: "closed" })).toBe(OWNER_ERROR);
  });

  it("lets the owner mark resolved or reopen", () => {
    expect(ticketStatusChangeError({ ...owner, from: "open", to: "resolved" })).toBeNull();
    expect(ticketStatusChangeError({ ...owner, from: "in_progress", to: "resolved" })).toBeNull();
    expect(ticketStatusChangeError({ ...owner, from: "closed", to: "open" })).toBeNull();
    expect(ticketStatusChangeError({ ...owner, from: "resolved", to: "open" })).toBeNull();
  });

  it("lets an admin set any status", () => {
    for (const to of ["open", "in_progress", "resolved", "closed"]) {
      expect(ticketStatusChangeError({ isAdmin: true, isOwner: false, from: "open", to })).toBeNull();
    }
  });

  it("refuses someone who is neither the owner nor an admin", () => {
    expect(ticketStatusChangeError({ isAdmin: false, isOwner: false, from: "open", to: "resolved" })).toBe(
      "Unauthorized.",
    );
  });

  it("refuses an unknown status, even for an admin", () => {
    expect(ticketStatusChangeError({ isAdmin: true, isOwner: true, from: "open", to: "deleted" })).toBe(
      "Unknown status.",
    );
    expect(isTicketStatus("deleted")).toBe(false);
    expect(isTicketStatus("closed")).toBe(true);
  });
});

describe("support.ts status rules", () => {
  beforeEach(() => {
    tickets.length = 0;
    updates.length = 0;
    inserts.length = 0;
    vi.clearAllMocks();
  });

  const customer = { id: "u1", email: "c@example.com", role: "user" };
  const admin = { id: "a1", email: "a@example.com", role: "admin" };

  it("refuses a customer request for in progress without writing", async () => {
    tickets.push({ id: "t1", userId: "u1", status: "open" });
    const res = await updateTicketStatus(customer, "t1", "in_progress");
    expect(res).toEqual({ ok: false, error: OWNER_ERROR });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lets an admin close a customer's ticket", async () => {
    tickets.push({ id: "t1", userId: "u1", status: "open" });
    const res = await updateTicketStatus(admin, "t1", "closed");
    expect(res).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("closed");
  });

  it("reopens a closed ticket when the customer replies", async () => {
    tickets.push({ id: "t1", userId: "u1", status: "closed" });
    const res = await addMessageToTicket("t1", customer, "One more detail");
    expect(res).toEqual({ ok: true });
    expect(inserts[0]).toMatchObject({ senderRole: "user", message: "One more detail" });
    expect(updates[0].status).toBe("open");
  });

  it("keeps a closed ticket closed when support replies", async () => {
    tickets.push({ id: "t1", userId: "u1", status: "closed" });
    await addMessageToTicket("t1", admin, "Following up");
    expect(updates[0].status).toBe("closed");
  });
});
