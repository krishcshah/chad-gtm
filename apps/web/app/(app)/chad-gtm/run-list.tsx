import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import { hostOf } from "@/components/chad-gtm/working-panel";
import type { RunSummary } from "./autopilot-launcher";
import { guidedSetupHref, PhaseBadge } from "./launch-setup";
import { MODE_LABEL } from "@/lib/lead-conversations";

// Same names as "Lead conversations" everywhere else.
const REPLY_MODE: Record<string, string> = {
  autopilot: MODE_LABEL.agent,
  approve: MODE_LABEL.approve,
  off: MODE_LABEL.manual,
};

/** Every autopilot run for this user, newest first. */
export function RunList({ runs }: { runs: RunSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Your runs <span className="tabular ml-1 font-normal text-subtle-foreground">{runs.length}</span>
        </CardTitle>
        <CardDescription>Open a run to see sends, replies and meetings, or to change its settings.</CardDescription>
      </CardHeader>
      {runs.length === 0 ? (
        <EmptyState
          compact
          icon={Bot}
          title="No runs yet"
          description="Paste your website above to start your first run. It shows up here with its status."
        />
      ) : (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {runs.map((r) => {
            const host = hostOf(r.url);
            const name = r.companyName || host;
            return (
              <li key={r.id}>
                <Link
                  href={r.phase === "draft" ? guidedSetupHref(r.id) : `/chad-gtm/${r.id}`}
                  className="group flex items-center gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground"
                    aria-hidden
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium">{name}</span>
                      <PhaseBadge phase={r.phase} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-subtle-foreground" suppressHydrationWarning>
                      {host} · {r.dailyEmailLimit.toLocaleString()} a day ·{" "}
                      {REPLY_MODE[r.replyAgentMode] ?? MODE_LABEL.agent} · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
