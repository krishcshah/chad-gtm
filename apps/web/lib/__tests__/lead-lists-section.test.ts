import { describe, expect, it } from "vitest";
import { filterLeadLists, type LeadListItem } from "@/app/(app)/campaigns/lead-lists-section";

const list = (id: string, name: string, usedBy: string[] = []): LeadListItem => ({
  id,
  name,
  leadCount: 10,
  createdLabel: "Nov 1, 2026",
  usedBy,
});

const lists = [
  list("a", "Berlin founders", ["Q4 outreach"]),
  list("b", "Imported CSV"),
  list("c", "Logistics VPs", ["Freight push", "Q4 follow-up"]),
];

describe("filterLeadLists", () => {
  it("returns every list, including unused ones, for an empty query", () => {
    expect(filterLeadLists(lists, "").map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(filterLeadLists(lists, "   ").map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("matches the list name, ignoring case", () => {
    expect(filterLeadLists(lists, "berlin").map((l) => l.id)).toEqual(["a"]);
    expect(filterLeadLists(lists, "IMPORTED").map((l) => l.id)).toEqual(["b"]);
  });

  it("matches the name of a campaign that uses the list, ignoring case", () => {
    expect(filterLeadLists(lists, "freight").map((l) => l.id)).toEqual(["c"]);
    expect(filterLeadLists(lists, "q4").map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("returns nothing when no list or campaign matches", () => {
    expect(filterLeadLists(lists, "nothing like this")).toEqual([]);
  });
});
