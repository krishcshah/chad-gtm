import type { Metadata } from "next";
import { listAgentRequests, listKnowledge } from "@/lib/autopilot-actions";
import { requireWorkspace } from "@/lib/session";
import { loadInboxSignals } from "@/lib/unibox-query";
import { RequestsClient } from "./requests-client";

/** Inbox conversations nobody is answering, and those held while the account is on hold. 0 when they can't be counted. */
async function countSignals(): Promise<{ awaiting: number; held: number }> {
  try {
    const { user, workspace } = await requireWorkspace();
    const { awaiting, held } = await loadInboxSignals(user.id, workspace);
    return { awaiting, held };
  } catch (err) {
    console.error("[requests] could not count replies awaiting you", err);
    return { awaiting: 0, held: 0 };
  }
}

export const metadata: Metadata = { title: "Needs you" };
export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  /** `request`: a card to highlight. `run`: only that Autopilot run's cards. */
  searchParams: Promise<{ request?: string; run?: string }>;
}) {
  const sp = await searchParams;
  const highlightId = typeof sp.request === "string" && sp.request ? sp.request : null;
  const runId = typeof sp.run === "string" && sp.run ? sp.run : null;
  const [allOpen, all, knowledge, { awaiting, held }] = await Promise.all([
    listAgentRequests("open"),
    listAgentRequests("all"),
    listKnowledge(),
    countSignals(),
  ]);
  const open = runId ? allOpen.filter((r) => r.runId === runId) : allOpen;
  const history = all.filter((r) => r.status !== "open").slice(0, 25);
  const runFilter = runId
    ? { runId, companyName: all.find((r) => r.runId === runId && r.companyName)?.companyName ?? "" }
    : null;
  return (
    <RequestsClient
      open={open}
      history={history}
      knowledge={knowledge}
      awaiting={awaiting}
      held={held}
      runFilter={runFilter}
      highlightId={highlightId}
      highlightClosed={Boolean(highlightId) && !open.some((r) => r.id === highlightId)}
    />
  );
}
