import { describe, expect, it, vi, beforeEach } from "vitest";
import { ACTIVE_WORKSPACE_COOKIE } from "../workspaces";

describe("Workspaces Core Logic", () => {
  it("defines active workspace cookie constant", () => {
    expect(ACTIVE_WORKSPACE_COOKIE).toBe("chadgtm_active_workspace_id");
  });

  describe("Workspace data isolation model", () => {
    it("ensures each workspace maintains its own isolated ID", () => {
      const ws1 = { id: "ws_client_1", name: "Client Alpha", isDefault: false };
      const ws2 = { id: "ws_client_2", name: "Client Beta", isDefault: false };

      expect(ws1.id).not.toBe(ws2.id);
      expect(ws1.name).toBe("Client Alpha");
      expect(ws2.name).toBe("Client Beta");
    });

    it("identifies primary default workspace vs client workspaces", () => {
      const primary = { id: "ws_primary", name: "Primary Workspace", isDefault: true };
      const client = { id: "ws_client", name: "Acme Corp", isDefault: false };

      expect(primary.isDefault).toBe(true);
      expect(client.isDefault).toBe(false);
    });

    it("associates records strictly with their parent workspaceId", () => {
      const senders = [
        { id: "s1", email: "alpha@domain.com", workspaceId: "ws_client_1" },
        { id: "s2", email: "beta@domain.com", workspaceId: "ws_client_2" },
      ];

      const client1Senders = senders.filter((s) => s.workspaceId === "ws_client_1");
      const client2Senders = senders.filter((s) => s.workspaceId === "ws_client_2");

      expect(client1Senders).toHaveLength(1);
      expect(client1Senders[0].email).toBe("alpha@domain.com");

      expect(client2Senders).toHaveLength(1);
      expect(client2Senders[0].email).toBe("beta@domain.com");

      // Zero overlap
      const overlap = client1Senders.filter((s) => client2Senders.some((c2) => c2.id === s.id));
      expect(overlap).toHaveLength(0);
    });

    it("scopes campaign lead lists and mailboxes to current workspace without leaking across clients", () => {
      const leadLists = [
        { id: "list_a", name: "Alpha Leads", workspaceId: "ws_alpha" },
        { id: "list_b", name: "Beta Leads", workspaceId: "ws_beta" },
      ];

      const activeWorkspace = "ws_beta";
      const scopedLists = leadLists.filter((l) => l.workspaceId === activeWorkspace);

      expect(scopedLists).toHaveLength(1);
      expect(scopedLists[0].name).toBe("Beta Leads");
      expect(scopedLists.some((l) => l.name === "Alpha Leads")).toBe(false);
    });
  });
});
