"use client";

import { useState } from "react";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import type { AgentRequestView } from "@/lib/autopilot-actions";

const COLLAPSED = 5;

/** Requests closed in the past, newest first. */
export function RequestHistory({ items }: { items: AgentRequestView[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, COLLAPSED);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recently closed</CardTitle>
        <CardDescription>Requests you answered or dismissed.</CardDescription>
      </CardHeader>
      <ul className="mt-3 divide-y divide-border border-t border-border">
        {shown.map((item) => {
          const resolved = item.status === "resolved";
          return (
            <li key={item.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{item.title}</p>
                <p className="truncate text-xs text-subtle-foreground" suppressHydrationWarning>
                  {item.leadName || item.leadEmail} · {timeAgo(item.resolvedAt || item.createdAt)}
                </p>
                {resolved && item.resolution ? (
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{item.resolution}</p>
                ) : null}
              </div>
              <Badge variant={resolved ? "success" : "outline"} className="mt-0.5 shrink-0">
                {resolved ? "Answered" : "Dismissed"}
              </Badge>
            </li>
          );
        })}
      </ul>
      {items.length > COLLAPSED ? (
        <div className="border-t border-border px-5 py-2.5">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
