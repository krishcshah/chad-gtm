import { describe, expect, it, vi } from "vitest";
import {
  clearRecentSent,
  rememberSent,
  repeatedAcrossLeads,
  buildCopyPrompt,
  buildCriticPrompt,
  checkDraft,
  criticProblems,
  suggestedAngle,
  suggestedRoleAngle,
  parseAnglePlan,
  planAngles,
  clearAnglePlans,
  ctaLeadIn,
  easyOutRole,
  relativeAge,
  usableFacts,
  hasLink,
  inferStep,
  inventedNumbers,
  threadSubject,
  writeEmail,
  type CopyRequest,
} from "../copywriter";
import { userNoteFromInstruction } from "../ai";

const base = (over: Partial<CopyRequest> = {}): CopyRequest => ({
  step: 1,
  sender: {
    companyName: "Northwind",
    companySummary: "Dispatch software for regional freight carriers.",
    valueProposition: "Dispatchers plan the day in one board instead of five spreadsheets.",
    painPoints: ["Dispatch lives in spreadsheets", "Drivers call in for every change"],
    proofPoints: ["Used by 40 regional carriers"],
    capabilities: ["One dispatch board for every depot", "Pushes route changes to drivers' phones"],
  },
  senderFirstName: "Sam",
  recipient: { firstName: "Marco", jobTitle: "Head of Operations", company: "Haulio", industry: "Logistics" },
  research: {
    domain: "haulio.com",
    fetched: true,
    summary: "Haulio runs regional freight across Texas.",
    sellsTo: "retailers",
    sizeHint: "mid-market",
    systems: [],
    facts: [
      {
        fact: "Haulio opened a second depot in Dallas.",
        quote: "our new Dallas depot is now open",
        date: "Oct 2026",
        relevance: 3,
      },
    ],
    researchedAt: "2026-11-07T00:00:00Z",
  },
  ...over,
});

const good1 = {
  subject: "dallas depot dispatch",
  hook: "fact" as const,
  factIndex: 1,
  body:
    "Hi Marco,\n\nSaw Haulio opened a second depot in Dallas. That's a second yard for you to dispatch from every morning.\n\nNorthwind puts every depot on one dispatch board and pushes route changes to drivers' phones, so Dallas runs from the same plan as home.\n\nOpen to seeing Dallas and your main yard on one board?\n\nSam",
};

describe("prompt", () => {
  it("includes triggers with quotes, capabilities, the full banned list and the step brief", () => {
    const { prompt, system } = buildCopyPrompt(base());
    expect(system).toMatch(/never invent/i);
    expect(prompt).toContain('page says: "our new Dallas depot is now open"');
    expect(prompt).toContain("CAPABILITIES (the only things you may say the product does, and only where they logically apply)");
    expect(prompt).toContain("One dispatch board for every depot");
    expect(prompt).toContain("EMAIL 1 OF 3");
    expect(prompt).toContain("streamline");
    expect(prompt).not.toContain("spintax");
  });

  it("suggests a capability email 1 did not use for email 2, with the problem it covers", () => {
    const req = base({
      step: 2,
      seed: "a@x.com",
      prior: [{ step: 1, subject: "dallas depot dispatch", body: "Hi Marco,\n\nNorthwind puts every depot on one dispatch board.\n\nSam" }],
    });
    // A pain is attached only when it clearly matches; a loose one-word match is left off.
    expect(suggestedAngle(req)).toBe("Pushes route changes to drivers' phones");
    expect(buildCopyPrompt(req).prompt).toContain("Already used in this thread");
  });

  it("states the real range of trigger numbers", () => {
    expect(buildCopyPrompt(base()).prompt).toContain("factIndex: the trigger number you used (1)");
  });

  it("tells the model there are no facts instead of leaving room to invent", () => {
    const { prompt } = buildCopyPrompt(base({ research: null }));
    expect(prompt).toContain("none found: use the role hook");
  });

  it("gives follow-ups the thread so far and their own brief", () => {
    const { prompt } = buildCopyPrompt(
      base({ step: 2, prior: [{ step: 1, subject: "dallas depot", body: good1.body }] }),
    );
    expect(prompt).toContain("EMAIL 2 OF 3");
    expect(prompt).toContain("THREAD SO FAR");
    expect(prompt).toContain("Saw Haulio opened a second depot");
  });
});

describe("quality gate", () => {
  it("passes a good first email", () => {
    expect(checkDraft(base(), good1)).toEqual([]);
  });

  it("catches links, placeholders, filler, exclamation marks and missing names", () => {
    const bad = {
      subject: "Quick Question!",
      body: "Hope this email finds you well! I wanted to reach out about {{company}}. Check https://northwind.io for more. We can unlock growth.",
    };
    const problems = checkDraft(base(), bad).join(" ");
    expect(problems).toMatch(/link/);
    expect(problems).toMatch(/placeholders/);
    expect(problems).toMatch(/exclamation/);
    expect(problems).toMatch(/hope this email finds you/);
    expect(problems).toMatch(/Hi Marco/);
    expect(problems).toMatch(/Subject/);
  });

  it("flags numbers that are not in a quote or proof point, including spelled-out ones", () => {
    expect(inventedNumbers("Cut costs by 37% for 40 carriers", "Used by 40 regional carriers")).toEqual(["37%"]);
    expect(inventedNumbers("That's six new sites", "adds two locations")).toEqual(["six"]);
  });

  it("catches guessing, invented social proof, presumptuous closes and third-person titles", () => {
    const req = base({ recipient: { firstName: "Marco", jobTitle: "Corporate Controller", company: "Haulio" } });
    const p = checkDraft(req, {
      subject: "invoice approvals at haulio",
      hook: "role",
      body: "Hi Marco,\n\nI'd guess approvals probably land on the controller's desk. Finance leads tell us it hurts.\n\nNorthwind puts every depot on one dispatch board for the whole team every day.\n\nWorth a look?\n\nSam",
    }).join(" ");
    expect(p).toMatch(/i'd guess/);
    expect(p).toMatch(/probably/);
    expect(p).toMatch(/tell us/);
    expect(p).toMatch(/not about "the controller"/);
    expect(p).toMatch(/X at \{company\}/);
    expect(p).toMatch(/Worth a look/);
  });

  it("allows one question, never asking for names or internal numbers", () => {
    const two = good1.body.replace("Open to seeing Dallas and your main yard on one board?", "Does Dallas use the board? Is it on the same plan as home?");
    expect(checkDraft(base(), { ...good1, body: two }).join(" ")).toMatch(/only one question/);
    const who = good1.body.replace("Open to seeing Dallas and your main yard on one board?", "Who plans the Dallas routes today?");
    expect(checkDraft(base(), { ...good1, body: who }).join(" ")).toMatch(/name people or give internal numbers/);
  });

  it("blocks wording copied from the built-in examples", () => {
    const copied = good1.body.replace("That's a second yard for you to dispatch from every morning.", "That's two more rotas for you to build and cover every week.");
    expect(checkDraft(base(), { ...good1, body: copied }).join(" ")).toMatch(/copies the example wording/);
  });

  it("does not let you guess their systems", () => {
    const guess = good1.body.replace("Northwind puts every depot", "If you use Samsara, Northwind puts every depot");
    expect(checkDraft(base(), { ...good1, body: guess }).join(" ")).toMatch(/don't know their systems/);
  });

  it("catches one sentence going to every lead in a campaign", () => {
    clearRecentSent();
    const req = base({ campaignKey: "northwind|x" });
    const shared = "Running two yards means two morning plans and twice the phone calls for your team.";
    rememberSent(req, `Hi A,\n\nOpener one about something.\n\n${shared}\n\nSam`);
    rememberSent(req, `Hi B,\n\nA different opener entirely here.\n\n${shared}\n\nSam`);
    expect(repeatedAcrossLeads(req, `Hi Marco,\n\nSomething new.\n\n${shared}\n\nSam`)).toBe(shared);
    expect(repeatedAcrossLeads(base(), `Hi Marco,\n\n${shared}`)).toBeNull();
    // Approved capability and proof wording may repeat across leads.
    const capLine = "Northwind gives you one dispatch board for every depot you run.";
    rememberSent(req, `Hi C,\n\n${capLine}\n\nSam`);
    rememberSent(req, `Hi D,\n\n${capLine}\n\nSam`);
    expect(repeatedAcrossLeads(req, `Hi Marco,\n\n${capLine}\n\nSam`)).toBeNull();
    clearRecentSent();
  });

  it("varies the role angle per lead and keeps integrations out unless their systems are known", () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `lead${i}@co${i}.com`);
    const seen = new Set(seeds.map((seed) => suggestedRoleAngle(base({ seed, campaignKey: "k" }))));
    expect(seen.size).toBeGreaterThan(1);
    const withIntegration = base({ step: 2, seed: "a@x.com" });
    withIntegration.sender = { ...withIntegration.sender, capabilities: ["Works alongside NetSuite"] };
    expect(suggestedAngle(withIntegration)).toBe("");
  });

  it("rejects hypothetical value questions and deadline-week check-backs", () => {
    const prior = [{ step: 1 as const, subject: "s", body: good1.body }];
    const two = checkDraft(base({ step: 2, prior }), {
      subject: "",
      body: "Hi Marco,\n\nWhen a route changes, Northwind pushes it to the driver's phone, so dispatch hears about it once.\n\nWould that save your dispatchers time?\n\nSam",
    });
    expect(two.join(" ")).toMatch(/hypothetical/);
    const three = checkDraft(base({ step: 3, prior }), {
      subject: "",
      body: "Hi Marco,\n\nI got in touch about the Dallas depot. Should I try again before quarter-end?\n\nSam",
    });
    expect(three.join(" ")).toMatch(/deadline/);
  });

  it("rejects recency words for an undated trigger and a fact hook that points nowhere", () => {
    const undated = base();
    undated.research!.facts[0]!.date = undefined;
    const body = good1.body.replace("Saw Haulio opened", "Saw Haulio just opened");
    expect(checkDraft(undated, { ...good1, body }).join(" ")).toMatch(/no date/);
    expect(checkDraft(base(), { ...good1, factIndex: 4 }).join(" ")).toMatch(/factIndex/);
  });

  it("allows a company whose name is a domain", () => {
    expect(hasLink("Saw Booking.com is hiring", ["Booking.com"])).toBe(false);
    expect(hasLink("See northwind.io/demo", ["Haulio"])).toBe(true);
  });

  it("rejects a follow-up that repeats email 1", () => {
    const req = base({ step: 2, prior: [{ step: 1, subject: "dallas depot", body: good1.body }] });
    const problems = checkDraft(req, {
      subject: "",
      body: "Hi Marco,\n\nSaw Haulio opened a second depot in Dallas. Any thoughts on this one for your team?\n\nSam",
    });
    expect(problems.join(" ")).toMatch(/new angle/);
  });
});

describe("writeEmail", () => {
  it("asks for one rewrite with the exact problems, then returns the clean draft", async () => {
    const pass = { logic: 5, claims: 5, specific: 4, reply: 4, notes: [] };
    const llm = vi
      .fn()
      .mockResolvedValueOnce({ subject: "dallas depot", body: "Hi Marco! Check https://x.com\n\nSam" })
      .mockResolvedValueOnce(good1)
      .mockResolvedValueOnce(pass);
    const out = await writeEmail(base(), llm);
    expect(llm).toHaveBeenCalledTimes(3);
    expect(llm.mock.calls[1]![0]).toContain("YOUR LAST DRAFT WAS REJECTED");
    expect(llm.mock.calls[2]![1]).toMatch(/recipient of a cold email/);
    expect(out.problems).toEqual([]);
    expect(out.subject).toBe("dallas depot dispatch");
  });

  it("rewrites when the recipient finds a stretched fact, and blocks if it never improves", async () => {
    const bad = { logic: 2, claims: 5, specific: 4, reply: 2, notes: ["189,000 locations are their customers, not their sites."] };
    const llm = vi.fn().mockImplementation(async (_p: string, system: string) => (/recipient/.test(system) ? bad : good1));
    await expect(writeEmail(base(), llm)).rejects.toThrow(/stretched/);
    expect(llm.mock.calls.filter((c) => /REJECTED/.test(c[0])).length).toBe(2);
    expect(llm.mock.calls[2]![0]).toContain("their customers, not their sites");
  });

  it("refuses to return a draft that still has a link after the rewrites", async () => {
    const llm = vi.fn().mockResolvedValue({ subject: "hi", body: "Hi Marco,\n\nGo to https://x.com now please.\n\nSam" });
    await expect(writeEmail(base(), llm)).rejects.toThrow(/quality checks/);
  });

  it("keeps follow-ups in the thread with Re: and the first subject", async () => {
    const llm = vi.fn().mockImplementation(async (_p: string, system: string) =>
      /recipient/.test(system)
        ? { logic: 5, claims: 5, specific: 4, reply: 3, notes: [] }
        : {
            subject: "something new",
            body: "Hi Marco,\n\nWhen a driver's route changes, Northwind pushes it to their phone, so nobody has to call dispatch to ask.\n\nWould that quiet the phones in Dallas?\n\nSam",
          },
    );
    const out = await writeEmail(
      base({ step: 2, threadSubject: "dallas depot", prior: [{ step: 1, subject: "dallas depot", body: good1.body }] }),
      llm,
    );
    expect(out.subject).toBe("Re: dallas depot");
  });

  it("fails closed without a model", async () => {
    await expect(writeEmail(base(), async () => null)).rejects.toThrow(/No AI model/);
  });
});

describe("recipient review", () => {
  it("asks as the recipient and lists the capabilities as the limit", () => {
    const p = buildCriticPrompt(base(), good1);
    expect(p).toContain("You are Head of Operations at Haulio");
    expect(p).toContain("One dispatch board for every depot");
  });
  it("only fails on logic, claims or a template feel", () => {
    expect(criticProblems({ logic: 5, claims: 5, specific: 4, reply: 3, notes: ["meh"] })).toEqual([]);
    expect(criticProblems({ logic: 5, claims: 5, specific: 4, reply: 2, notes: [] })[0]).toMatch(/would not reply/);
    expect(criticProblems({ logic: 3, claims: 5, specific: 4, reply: 3, notes: ["x"] })[0]).toMatch(/stretched/);
  });
});

describe("helpers", () => {
  it("infers the step from position or old instructions", () => {
    expect(inferStep(2)).toBe(2);
    expect(inferStep(7)).toBe(3);
    expect(inferStep(undefined, "Write follow-up #1 (sent 3 days after")).toBe(2);
    expect(inferStep(undefined, "Write follow-up #2 (final breakup email")).toBe(3);
    expect(inferStep(undefined, "Write a first-touch cold email")).toBe(1);
  });

  it("threads subjects once", () => {
    expect(threadSubject("dallas depot")).toBe("Re: dallas depot");
    expect(threadSubject("re: dallas depot")).toBe("re: dallas depot");
  });

  it("drops old generated boilerplate but keeps what a person wrote", () => {
    const note = userNoteFromInstruction(
      "Company: Northwind. Value offer: x. Angle: y. Call to action: z. Write a first-touch cold email in 35-70 words.\n\nSPINTAX: include {Hi|Hey}\n\nMention we only work with carriers under 200 trucks.",
    );
    expect(note).toBe("Mention we only work with carriers under 200 trucks.");
  });
});

describe("angle plan (v5)", () => {
  const sender = base().sender;
  const plan = [
    { pain: "Dispatch lives in spreadsheets", capabilities: [1], stakes: 3, proof: true },
    { pain: "Drivers call in for every change", capabilities: [2], stakes: 2, proof: false },
  ];

  it("parses the model's plan, dropping problems no capability fixes and bad numbers", () => {
    const parsed = parseAnglePlan(
      {
        angles: [
          { pain: "Drivers call in", capabilities: [2], stakes: 2 },
          { pain: "Fuel costs", capabilities: [9], stakes: 3 },
          { pain: "Spreadsheets", capabilities: [1], stakes: 5, proof: true },
        ],
      },
      sender,
    );
    expect(parsed).toEqual([
      { pain: "Spreadsheets", capabilities: [1], stakes: 3, proof: true },
      { pain: "Drivers call in", capabilities: [2], stakes: 2, proof: false },
    ]);
  });

  it("builds the plan once per campaign", async () => {
    clearAnglePlans();
    const llm = vi.fn().mockResolvedValue({ angles: plan });
    await planAngles(sender, llm, "k1");
    await planAngles(sender, llm, "k1");
    expect(llm).toHaveBeenCalledTimes(1);
    clearAnglePlans();
  });

  it("gives email 2 a different problem and capability from email 1", () => {
    const req = base({
      step: 2,
      angles: plan,
      prior: [{ step: 1, subject: "s", body: "Hi Marco,\n\nx\n\nSam", capabilities: [1], pain: "Dispatch lives in spreadsheets" }],
    });
    expect(suggestedAngle(req)).toBe(
      "Drivers call in for every change → Pushes route changes to drivers' phones (the proof point does not support this; leave it out)",
    );
  });

  it("rotates the CTA lead-in across leads", () => {
    const leadIns = new Set(Array.from({ length: 30 }, (_, i) => ctaLeadIn(base({ seed: `p${i}@c${i}.com`, campaignKey: "k" }))));
    expect(leadIns.size).toBeGreaterThan(2);
  });
});

describe("triggers and rewrites (v5)", () => {
  it("states trigger age relatively and drops old triggers", () => {
    const now = new Date("2026-11-07T00:00:00Z");
    expect(relativeAge("November 2, 2026", now)).toBe("this week");
    expect(relativeAge("2026-09-01", now)).toBe("2 months ago");
    const req = base({ now });
    req.research!.facts = [
      { fact: "Old.", quote: "an old event happened here", date: "2025-01-01", relevance: 3 },
      { fact: "New.", quote: "a new event happened here", date: "2026-10-20", relevance: 3 },
    ];
    expect(usableFacts(req).map((f) => f.fact)).toEqual(["New."]);
  });

  it("shows the rejected draft and asks for the smallest fix", () => {
    const { prompt } = buildCopyPrompt(base(), ["Remove exclamation marks."], "Hi Marco!\n\nSam");
    expect(prompt).toContain("YOUR LAST DRAFT WAS REJECTED.\n---\nHi Marco!");
    expect(prompt).toContain("smallest edits");
  });

  it("blocks questions that imply an immature process", () => {
    const req = base({ step: 2, prior: [{ step: 1, subject: "s", body: good1.body }] });
    const p = checkDraft(req, {
      subject: "",
      body: "Hi Marco,\n\nWhen a route changes, Northwind pushes it to the driver's phone, so dispatch hears about it once.\n\nAre route changes sent by hand today, or from a tool?\n\nSam",
    });
    expect(p.join(" ")).toMatch(/immature/);
  });

  it("fails a draft whose offer doesn't fix the problem it names", () => {
    expect(criticProblems({ logic: 5, claims: 5, fit: 2, specific: 4, reply: 3, notes: [] })[0]).toMatch(/doesn't fix the problem/);
  });
});

describe("v6 rules", () => {
  it("suggests an easy-out role that fits the reader's seniority", () => {
    expect(easyOutRole("VP Finance")).toMatch(/one level down/);
    expect(easyOutRole("Assistant Controller")).toMatch(/runs this day to day/);
    expect(buildCopyPrompt(base({ step: 3, recipient: { firstName: "Marco", jobTitle: "CFO", company: "Haulio" } })).prompt).toContain("one level down");
  });

  it("flags manual-work wording anywhere in the email", () => {
    const body = good1.body.replace("That's a second yard for you to dispatch from every morning.", "Your team probably keys in every route by hand.");
    expect(checkDraft(base(), { ...good1, body }).join(" ")).toMatch(/manual or immature/);
  });

  it("flags a company name pasted into a general opener", () => {
    const body = good1.body.replace("Saw Haulio opened a second depot in Dallas.", "Dispatch at Haulio often comes down to the last few route changes.");
    expect(checkDraft(base(), { ...good1, hook: "role", factIndex: undefined, body }).join(" ")).toMatch(/company name/);
  });

  it("catches a near-identical opener even after one other lead", () => {
    clearRecentSent();
    const req = base({ campaignKey: "k6" });
    rememberSent(req, "Hi A,\n\nFor ops leads, the morning plan often falls apart on the first route change.\n\nSam");
    expect(repeatedAcrossLeads(req, "Hi B,\n\nFor ops leads, the morning plan often falls apart at the first route change.\n\nSam")).toMatch(/morning plan/);
    clearRecentSent();
  });
});

describe("final rules", () => {
  it("blocks role-label openers", () => {
    const body = good1.body.replace("Saw Haulio opened a second depot in Dallas.", "For ops leads, dispatch falls apart at the first route change.");
    expect(checkDraft(base(), { ...good1, hook: "role", factIndex: undefined, body }).join(" ")).toMatch(/label for their role/);
  });
  it("never re-suggests a capability email 1 used", () => {
    const req = base({
      step: 2,
      angles: [{ pain: "Dispatch lives in spreadsheets", capabilities: [1, 2], stakes: 3, proof: true }],
      prior: [{ step: 1, subject: "s", body: "Hi Marco,\n\nx\n\nSam", capabilities: [1, 2] }],
    });
    expect(suggestedAngle(req)).toBe("");
  });
  it("tells the writer today's date", () => {
    expect(buildCopyPrompt(base({ now: new Date("2026-11-07T12:00:00Z") })).prompt).toContain("TODAY: Saturday, November 7, 2026");
  });
});
