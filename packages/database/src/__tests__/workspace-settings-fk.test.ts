import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { workspaceSettings, workspaces } from "../schema";

describe("workspace_settings.workspace_id", () => {
  it("is set to null, not cascaded, when its workspace is deleted", () => {
    const fks = getTableConfig(workspaceSettings).foreignKeys.filter((fk) => {
      const ref = fk.reference();
      return ref.columns.some((c) => c.name === "workspace_id") && ref.foreignTable === workspaces;
    });
    expect(fks).toHaveLength(1);
    expect(fks[0].onDelete).toBe("set null");
  });
});
