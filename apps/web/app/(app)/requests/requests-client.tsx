"use client";

import { CheckCircle2 } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@smartreach/ui";
import type { AgentRequestView, KnowledgeView } from "@/lib/autopilot-actions";
import { Page } from "@/components/layout/page";
import { KnowledgePanel } from "./knowledge-panel";
import { RequestCard } from "./request-card";
import { RequestHistory } from "./request-history";

/** "Needs you": the reply agent's escalations, plus the knowledge it may draw on. */
export function RequestsClient({
  open,
  history,
  knowledge,
}: {
  open: AgentRequestView[];
  history: AgentRequestView[];
  knowledge: KnowledgeView[];
}) {
  return (
    <Page>
      <PageHeader
        title="Needs you"
        description="The agent answers replies on its own. When a lead asks for something it does not have, like a case study or a pricing detail, that thread waits here for you. What you share is saved, so it will not ask twice."
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
                  ? "Newest first. The agent will not reply to these leads until you answer, approve or dismiss."
                  : undefined
              }
            />
            {open.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  icon={CheckCircle2}
                  title="You're all caught up"
                  description="The agent is handling every conversation. You get an email as soon as it needs something."
                />
              </Card>
            ) : (
              <ul className="flex flex-col gap-4">
                {open.map((request) => (
                  <li key={request.id}>
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
