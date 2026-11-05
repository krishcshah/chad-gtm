import { desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { requireUser } from "@/lib/session";
import { getDb, ensureChadGtmTables } from "@/lib/db";
import { getDirectoryFacets } from "@/lib/leads-directory";
import { ChadGtmWizard } from "./chad-gtm-wizard";
import { AutopilotLauncher, type RunSummary } from "./autopilot-launcher";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Autopilot",
  description: "Paste your website. AutoGTM researches, prospects, sends, replies, and books meetings for you.",
};

export default async function ChadGtmPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser();
  const { mode } = await searchParams;

  if (mode === "guided") {
    const facets = getDirectoryFacets();
    return (
      <div className="mx-auto max-w-6xl">
        <ChadGtmWizard allIndustries={facets.industries.map((i) => i.value)} />
      </div>
    );
  }

  const db = getDb();
  await ensureChadGtmTables(db);
  const rows = await db
    .select({
      id: schema.chadGtmRuns.id,
      companyName: schema.chadGtmRuns.companyName,
      url: schema.chadGtmRuns.url,
      status: schema.chadGtmRuns.status,
      campaignId: schema.chadGtmRuns.campaignId,
      bookingUrl: schema.chadGtmRuns.bookingUrl,
      autopilot: schema.chadGtmRuns.autopilot,
      replyAgentMode: schema.chadGtmRuns.replyAgentMode,
      dailyEmailLimit: schema.chadGtmRuns.dailyEmailLimit,
      createdAt: schema.chadGtmRuns.createdAt,
    })
    .from(schema.chadGtmRuns)
    .where(eq(schema.chadGtmRuns.userId, user.id))
    .orderBy(desc(schema.chadGtmRuns.createdAt))
    .limit(30);

  return <AutopilotLauncher runs={rows as RunSummary[]} />;
}
