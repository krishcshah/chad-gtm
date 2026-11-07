/**
 * Knowledge is per workspace: the reply agent uses the same scope as the
 * Needs you knowledge list, and items with no workspace belong to the
 * default workspace.
 */
import { describe, expect, it } from "vitest";
import { knowledgeProfile, knowledgeScope } from "../reply-agent";

describe("knowledgeScope", () => {
  it("includes legacy items with no workspace for a run in the default workspace", () => {
    expect(knowledgeScope({ workspaceId: "w-default", isDefault: true })).toEqual({
      workspaceId: "w-default",
      includeNull: true,
    });
  });

  it("only uses the workspace's own items in a non-default workspace", () => {
    expect(knowledgeScope({ workspaceId: "w-b", isDefault: false })).toEqual({ workspaceId: "w-b", includeNull: false });
  });

  it("falls back to every item of the owner when the owner has no workspace rows", () => {
    expect(knowledgeScope({ workspaceId: null, isDefault: false })).toEqual({ workspaceId: null, includeNull: true });
  });
});

describe("knowledgeProfile", () => {
  it("the campaign's workspace, flagged default only when that workspace is the default", () => {
    expect(knowledgeProfile({ workspaceId: "w1", settings: { id: "w1", isDefault: true } })).toEqual({
      workspaceId: "w1",
      isDefault: true,
    });
    expect(knowledgeProfile({ workspaceId: "w2", settings: { id: "w2", isDefault: false } })).toEqual({
      workspaceId: "w2",
      isDefault: false,
    });
    // Settings row missing or for another workspace: never widen to legacy items.
    expect(knowledgeProfile({ workspaceId: "w3", settings: null })).toEqual({ workspaceId: "w3", isDefault: false });
  });

  it("a legacy campaign with no workspace uses the owner's default workspace", () => {
    expect(knowledgeProfile({ workspaceId: null, settings: { id: "w-default", isDefault: true } })).toEqual({
      workspaceId: "w-default",
      isDefault: true,
    });
    expect(knowledgeProfile({ workspaceId: null, settings: null })).toEqual({ workspaceId: null, isDefault: false });
  });
});
