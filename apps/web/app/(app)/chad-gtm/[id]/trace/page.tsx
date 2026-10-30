import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getAgentTraceAction } from "@/lib/agent-actions";
import { AgentTraceView } from "@/components/chad-gtm/agent-trace-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agent Trace — AutoGTM",
  description: "Step-by-step execution trace for an AutoGTM agent run.",
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
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <AgentTraceView data={data} />
    </div>
  );
}
