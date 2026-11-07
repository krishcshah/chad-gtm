"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Reply } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SectionHeader, cn } from "@smartreach/ui";
import type { AgentRequestView, KnowledgeView } from "@/lib/autopilot-actions";
import { Page } from "@/components/layout/page";
import { KnowledgePanel } from "./knowledge-panel";
import { RequestCard } from "./request-card";
import { RequestHistory } from "./request-history";

/** How often the open list is refreshed while the page is visible (cards answered in the Inbox or another tab). */
const REFRESH_MS = 60_000;

/** "Needs you": the reply agent's escalations, plus the knowledge it may draw on. */
export function RequestsClient({
  open,
  history,
  knowledge,
  awaiting = 0,
  held = 0,
  runFilter = null,
  highlightId = null,
  highlightClosed = false,
}: {
  open: AgentRequestView[];
  history: AgentRequestView[];
  knowledge: KnowledgeView[];
  /** Inbox conversations awaiting your reply (campaigns without the agent). */
  awaiting?: number;
  /** Conversations held because the account is on hold (they move here once it is approved). */
  held?: number;
  /** ?run=…: only this Autopilot run's cards are listed. */
  runFilter?: { runId: string; companyName: string } | null;
  /** ?request=…: the card to show first (highlighted and scrolled to). */
  highlightId?: string | null;
  /** The linked request is no longer open. */
  highlightClosed?: boolean;
}) {
  const router = useRouter();

  // A link to one card: bring it into view once.
  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`request-${highlightId}`)?.scrollIntoView({ block: "start" });
  }, [highlightId]);

  // Cards resolved elsewhere (the Inbox, another tab, a teammate) disappear
  // without a manual reload: refresh while visible and when the tab regains focus.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return (
    <Page>
      <PageHeader
        title="Needs you"
        description="When the agent can't answer a lead on its own, like a case study, a pricing detail or a referral, the conversation waits here for you. What you share is saved, so it won't ask twice."
        meta={
          open.length > 0 ? (
            <Badge variant="warning" dot>
              {open.length} waiting
            </Badge>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {held > 0 ? (
            <Alert
              variant="warning"
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/unibox">View in Inbox</Link>
                </Button>
              }
            >
              <p className="font-medium">
                {held.toLocaleString()} {held === 1 ? "conversation is" : "conversations are"} on hold
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Your account is waiting for approval, so the agent isn&apos;t answering and replies can&apos;t be sent.
                They appear here as soon as an admin approves your account.
              </p>
            </Alert>
          ) : null}
          <section aria-labelledby="open-requests" className="flex flex-col gap-4">
            <SectionHeader
              title={
                <span id="open-requests">
                  Waiting on you{" "}
                  <span className="tabular font-normal text-muted-foreground">{open.length}</span>
                </span>
              }
              description={
                open.length > 0
                  ? "Newest first. The agent won't reply in these conversations until you answer. Dismissing one hands the conversation to you."
                  : undefined
              }
            />
            {highlightClosed ? <Alert variant="info">That request is already closed.</Alert> : null}
            {runFilter ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{runFilter.companyName || "this"}</span> autopilot.
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/requests">Show all</Link>
                </Button>
              </div>
            ) : null}
            {open.length === 0 ? (
              <Card>
                {awaiting > 0 ? (
                  <EmptyState
                    compact
                    icon={Reply}
                    title="Nothing from the agent"
                    description={`${awaiting.toLocaleString()} ${awaiting === 1 ? "reply" : "replies"} from campaigns without the agent ${awaiting === 1 ? "is" : "are"} waiting in your Inbox.`}
                    action={
                      <Button asChild size="sm" variant="outline">
                        <Link href="/unibox?view=awaiting">Open Awaiting your reply</Link>
                      </Button>
                    }
                  />
                ) : held > 0 ? (
                  <EmptyState
                    compact
                    icon={CheckCircle2}
                    title="Nothing else is waiting on you"
                    description="The conversations on hold appear here once your account is approved."
                  />
                ) : (
                  <EmptyState
                    compact
                    icon={CheckCircle2}
                    title="You're all caught up"
                    description="Nothing is waiting on you. The agent asks here when it needs something."
                  />
                )}
              </Card>
            ) : (
              <ul className="flex flex-col gap-4">
                {open.map((request) => (
                  <li
                    key={request.id}
                    id={`request-${request.id}`}
                    className={cn(
                      "scroll-mt-20 lg:scroll-mt-10",
                      request.id === highlightId && "rounded-xl ring-2 ring-ring",
                    )}
                  >
                    <RequestCard request={request} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {history.length > 0 ? <RequestHistory items={history} /> : null}
        </div>

        <div className="min-w-0">
          <KnowledgePanel items={knowledge} />
        </div>
      </div>
    </Page>
  );
}
