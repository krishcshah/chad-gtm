import { requireUser } from "@/lib/session";
import { getDirectoryFacets } from "@/lib/leads-directory";
import { ChadGtmWizard } from "./chad-gtm-wizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ChadGTM · Autonomous Go-To-Market & Cold Outreach Engine",
  description:
    "Self-driving cold outreach engine. Enter your company URL, extract verified Apollo leads, calibrate tone via swipe deck, and dispatch through pre-warmed shared mailboxes.",
};

export default async function ChadGtmPage() {
  await requireUser();

  const facets = getDirectoryFacets();
  const allIndustries = facets.industries.map((i) => i.value);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <ChadGtmWizard allIndustries={allIndustries} />
    </div>
  );
}
