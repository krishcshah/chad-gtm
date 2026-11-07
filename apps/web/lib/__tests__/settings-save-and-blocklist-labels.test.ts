import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sourceLabel } from "@/app/(app)/blocklist/blocklist-dialogs";
import { notificationsDirty } from "@/app/(app)/settings/notification-settings";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("Blocklist sourceLabel", () => {
  it("names agent 'not interested' opt-outs instead of showing the raw source", () => {
    expect(sourceLabel("not_interested")).toBe("Replied: not interested");
    expect(sourceLabel("complaint")).toBe("Spam complaint");
  });

  it("keeps the existing labels", () => {
    expect(sourceLabel("manual")).toBe("Added by you");
    expect(sourceLabel("erasure")).toBe("Removal request");
    expect(sourceLabel("")).toBe("Unknown");
  });
});

describe("Lead conversations card saves notifications with one button", () => {
  const saved = { notifyEmail: "ops@acme.test", notifyEscalations: true, notifyReminders: true };

  it("detects changed notification fields", () => {
    expect(notificationsDirty(saved, saved)).toBe(false);
    expect(notificationsDirty({ ...saved, notifyEmail: "  ops@acme.test " }, saved)).toBe(false);
    expect(notificationsDirty({ ...saved, notifyEmail: "me@acme.test" }, saved)).toBe(true);
    expect(notificationsDirty({ ...saved, notifyEscalations: false }, saved)).toBe(true);
    expect(notificationsDirty({ ...saved, notifyReminders: false }, saved)).toBe(true);
  });

  it("has no separate 'Save notifications' button; 'Save changes' saves them", () => {
    const section = read("app/(app)/settings/notification-settings.tsx");
    const card = read("app/(app)/settings/lead-conversations-card.tsx");
    expect(section).not.toMatch(/Save notifications/);
    expect(section).not.toMatch(/saveNotificationSettingsAction/);
    expect(card).toMatch(/saveNotificationSettingsAction/);
    expect(card.match(/<Button\b/g)?.length).toBe(1);
    expect(card).toMatch(/Save changes/);
  });
});
