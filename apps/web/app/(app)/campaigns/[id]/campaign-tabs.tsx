"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@smartreach/ui";

export function CampaignTabs({
  initialTab,
  stepCount,
  overview,
  sequence,
}: {
  initialTab: "overview" | "sequence";
  stepCount?: number;
  overview: React.ReactNode;
  sequence: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(initialTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value === "sequence" ? "sequence" : "overview";
        setTab(next);
        const params = new URLSearchParams(window.location.search);
        if (next === "sequence") params.set("tab", "sequence");
        else params.delete("tab");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    >
      <TabsList aria-label="Campaign sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="sequence">
          Sequence
          {typeof stepCount === "number" && stepCount > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0 text-[11px] tabular-nums text-muted-foreground">
              {stepCount}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-6">
        {overview}
      </TabsContent>
      <TabsContent value="sequence">{sequence}</TabsContent>
    </Tabs>
  );
}
