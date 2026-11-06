"use client";

import { useSearchParams } from "next/navigation";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@smartreach/ui";

export type CampaignTab = "overview" | "sequence";

function parseTab(value: string | null | undefined): CampaignTab | null {
  if (value === "sequence") return "sequence";
  if (value === "overview") return "overview";
  return null;
}

/** Switch tabs by updating ?tab= without a server round trip. */
export function setCampaignTab(next: CampaignTab) {
  const params = new URLSearchParams(window.location.search);
  if (next === "sequence") params.set("tab", "sequence");
  else params.delete("tab");
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

/**
 * Overview / Sequence tabs. The active tab lives in ?tab= so links can open
 * the sequence directly. Both panels stay mounted so unsaved sequence edits
 * survive a trip to the overview.
 */
export function CampaignTabs({
  initialTab,
  stepCount,
  overview,
  sequence,
}: {
  initialTab: CampaignTab;
  stepCount?: number;
  overview: React.ReactNode;
  sequence: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  // The URL is the source of truth once it is available; initialTab covers the first server render.
  const tab: CampaignTab = searchParams ? (parseTab(searchParams.get("tab")) ?? "overview") : initialTab;

  return (
    <Tabs value={tab} onValueChange={(value) => setCampaignTab(parseTab(value) ?? "overview")}>
      <TabsList aria-label="Campaign sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="sequence">
          Sequence
          {typeof stepCount === "number" && stepCount > 0 ? (
            <span className="tabular rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{stepCount}</span>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" forceMount className="data-[state=inactive]:hidden">
        {overview}
      </TabsContent>
      <TabsContent value="sequence" forceMount className="data-[state=inactive]:hidden">
        {sequence}
      </TabsContent>
    </Tabs>
  );
}

/** Opens the Sequence tab from elsewhere on the page (no navigation). */
export function OpenSequenceButton({ children }: { children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        setCampaignTab("sequence");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      {children}
    </Button>
  );
}
