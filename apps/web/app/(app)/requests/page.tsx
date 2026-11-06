import type { Metadata } from "next";
import { listAgentRequests, listKnowledge } from "@/lib/autopilot-actions";
import { RequestsClient } from "./requests-client";

export const metadata: Metadata = { title: "Needs you" };
export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const [open, all, knowledge] = await Promise.all([
    listAgentRequests("open"),
    listAgentRequests("all"),
    listKnowledge(),
  ]);
  const history = all.filter((r) => r.status !== "open").slice(0, 25);
  return <RequestsClient open={open} history={history} knowledge={knowledge} />;
}
