import { describe, expect, it } from "vitest";
import {
  addStep,
  addVariant,
  MAX_SEQUENCE_STEP_COUNT,
  moveStep,
  plainFromHtml,
  removeStep,
  removeVariant,
  stepsFromDto,
  textToHtml,
  toSavePayload,
  validateDraft,
  type DraftStep,
} from "../sequence-draft";

function step(partial: Partial<DraftStep> & Pick<DraftStep, "key">): DraftStep {
  return {
    delayDays: 0,
    type: "initial",
    variants: [
      {
        key: `${partial.key}-a`,
        label: "A",
        subject: "Hello",
        bodyHtml: "<p>Hi</p>",
        bodyText: "Hi",
        weight: 50,
        pausedAt: null,
        plainEdited: false,
      },
    ],
    ...partial,
  };
}

describe("sequence draft", () => {
  it("turns an empty list into a template-fallback payload", () => {
    expect(toSavePayload("camp-1", [])).toEqual({ campaignId: "camp-1", steps: [] });
  });

  it("numbers steps, forces A/B labels, and equal 50/50 weights", () => {
    const steps = stepsFromDto([
      {
        id: "s1",
        position: 4,
        delayDays: 0,
        type: "initial",
        variants: [
          {
            id: "v1",
            label: "Z",
            subject: "Hi {{first_name}}",
            bodyHtml: "<p>{Hi|Hey}</p>",
            bodyText: "{Hi|Hey}",
            weight: 80,
            pausedAt: null,
          },
          {
            id: "v2",
            label: "Y",
            subject: "Hello",
            bodyHtml: "",
            bodyText: "Hello",
            weight: 20,
            pausedAt: "2026-09-01T12:00:00.000Z",
          },
        ],
      },
    ]);
    const single = toSavePayload(
      "camp-1",
      steps.map((s) => removeVariant(s, 1)),
    );
    expect(single.steps[0]!.position).toBe(1);
    expect(single.steps[0]!.variants.map((v) => v.label)).toEqual(["A"]);
    expect(single.steps[0]!.variants[0]!.weight).toBe(50);
    expect(single.steps[0]!.variants[0]!.pausedAt).toBeNull();

    const both = toSavePayload("camp-1", steps);
    expect(both.steps[0]!.variants.map((v) => [v.label, v.weight])).toEqual([
      ["A", 50],
      ["B", 50],
    ]);
    expect(both.steps[0]!.variants[1]!.pausedAt).toBe("2026-09-01T12:00:00.000Z");

    const copied = addVariant(removeVariant(steps[0]!, 1));
    expect(copied.variants[1]!.subject).toBe("Hi {{first_name}}");
    expect(copied.variants[1]!.pausedAt).toBeNull();
    expect(copied.variants.map((v) => v.weight)).toEqual([50, 50]);
  });

  it("reorders without dropping ids and refuses a 21st step", () => {
    const steps = [step({ key: "a", id: "a" }), step({ key: "b", id: "b", type: "follow_up", delayDays: 2 })];
    const moved = moveStep(steps, 1, -1);
    expect(moved.map((s) => s.id)).toEqual(["b", "a"]);
    expect(moveStep(steps, 0, -1)).toBe(steps);

    let growing = steps;
    for (let i = steps.length; i < MAX_SEQUENCE_STEP_COUNT; i++) {
      const added = addStep(growing);
      expect(added.error).toBeUndefined();
      growing = added.steps;
    }
    expect(growing).toHaveLength(MAX_SEQUENCE_STEP_COUNT);
    const blocked = addStep(growing);
    expect(blocked.steps).toHaveLength(MAX_SEQUENCE_STEP_COUNT);
    expect(blocked.error).toMatch(/20/);
    expect(validateDraft(blocked.steps)).toBeNull();
  });

  it("removes a step and keeps a single variant labeled A", () => {
    const steps = [step({ key: "a" }), step({ key: "b", type: "follow_up" })];
    expect(removeStep(steps, 0).map((s) => s.key)).toEqual(["b"]);
    const withB = addVariant(steps[0]!);
    expect(withB.variants).toHaveLength(2);
    const back = removeVariant(withB, 0);
    expect(back.variants).toHaveLength(1);
    expect(back.variants[0]!.label).toBe("A");
    expect(removeVariant(back, 0).variants).toHaveLength(1);
  });

  it("round-trips simple html and plain text", () => {
    expect(plainFromHtml("<p>Hi {{first_name}}</p><p>{Hello|Hi} there</p>")).toBe(
      "Hi {{first_name}}\n{Hello|Hi} there",
    );
    expect(textToHtml("Hi\n\nThere")).toBe("<p>Hi</p><p>There</p>");
  });

  it("rejects an over-long subject", () => {
    const steps = [step({ key: "a" })];
    steps[0]!.variants[0]!.subject = "x".repeat(501);
    expect(validateDraft(steps)).toMatch(/500/);
  });
});
