/**
 * #59: a reply that arrives on a shared pool mailbox is filed under the
 * customer's workspace, never the pool mailbox's (the importing admin's).
 */
import { describe, expect, it } from "vitest";
import { replyOwnerWorkspaceId } from "../sync-replies";

describe("replyOwnerWorkspaceId", () => {
  it("uses the lead's workspace when it has one", () => {
    expect(replyOwnerWorkspaceId({ workspaceId: "w-client" }, { isSystemPool: true, workspaceId: "w-admin" })).toBe("w-client");
  });
  it("a pool mailbox whose lead has no workspace is stored with null, never the pool's workspace", () => {
    expect(replyOwnerWorkspaceId({ workspaceId: null }, { isSystemPool: true, workspaceId: "w-admin" })).toBeNull();
    expect(replyOwnerWorkspaceId(undefined, { isSystemPool: true, workspaceId: "w-admin" })).toBeNull();
  });
  it("a dedicated mailbox still falls back to its own workspace", () => {
    expect(replyOwnerWorkspaceId({ workspaceId: null }, { isSystemPool: false, workspaceId: "w-own" })).toBe("w-own");
  });
});
