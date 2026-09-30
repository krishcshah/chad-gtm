import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getChadGtmRunAction } from "@/lib/chad-gtm-actions";
import { MissionControlView } from "./mission-control-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mission Control · ChadGTM · SmartReach",
  description: "Live real-time telemetry, opens, replies, and controls for ChadGTM autonomous outreach.",
};

export default async function ChadGtmRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const data = await getChadGtmRunAction(id);
  if (!data || !data.run) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <MissionControlView runId={id} initialData={data} />
    </div>
  );
}
