import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getAgentTraceAction } from "@/lib/agent-actions";
import { AgentTraceView } from "@/components/chad-gtm/agent-trace-view";
import { Page } from "@/components/layout/page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Research trace",
  description: "Every step the agent took while researching and setting up an autopilot run.",
};

export default async function AgentTracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const data = await getAgentTraceAction(id);
  if (!data) notFound();

  return (
    <Page>
      <AgentTraceView data={data} />
    </Page>
  );
}
