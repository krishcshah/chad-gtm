"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Plus, Rocket, Search, SearchX } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Progress,
  SegmentedControl,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import { CampaignStatusBadge } from "../campaign-status-badge";
import { CampaignActions } from "./campaign-actions";
import { formatPercent } from "./format";
import { LeadListsSection, type LeadListItem } from "./lead-lists-section";

export interface CampaignListItem {
  id: string;
  name: string;
  status: string;
  /** Pre-formatted on the server so server and browser timezones cannot disagree (hydration). */
  createdLabel: string;
  /** Pre-formatted start date, only for scheduled campaigns. */
  scheduledLabel: string | null;
  leadListName: string | null;
  total: number;
  sent: number;
  replied: number;
  failed: number;
  /** Sends are held by the engine (no postal address): shown instead of the status. */
  held: boolean;
  /** Set when an Autopilot run manages this campaign. */
  autopilotRunId?: string | null;
}

type Filter = "all" | "active" | "paused" | "draft" | "finished";

const FILTERS: Record<Filter, (status: string) => boolean> = {
  all: () => true,
  active: (s) => s === "running" || s === "scheduled",
  paused: (s) => s === "paused",
  draft: (s) => s === "draft",
  finished: (s) => s === "completed" || s === "archived",
};

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  active: "Live",
  paused: "Paused",
  draft: "Drafts",
  finished: "Finished",
};

export function CampaignTable({
  campaigns,
  leadLists,
}: {
  campaigns: CampaignListItem[];
  /** Every lead list in the workspace; the same search box filters them. */
  leadLists: LeadListItem[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const key of Object.keys(FILTERS) as Filter[]) {
      out[key] = campaigns.filter((c) => FILTERS[key](c.status)).length;
    }
    return out;
  }, [campaigns]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter(
      (c) =>
        FILTERS[filter](c.status) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          (c.leadListName ?? "").toLowerCase().includes(q)),
    );
  }, [campaigns, filter, query]);

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          icon={Rocket}
          title="No campaigns yet"
          description="Autopilot reads your website, finds buyers and writes the emails for you. Or build a campaign yourself from one of your lead lists."
          action={
            <>
              <Button asChild>
                <Link href="/chad-gtm">
                  <Bot />
                  Run autopilot
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/campaigns/new">
                  <Plus />
                  New campaign
                </Link>
              </Button>
            </>
          }
        />
        <LeadListsSection lists={leadLists} query="" />
      </div>
    );
  }

  const filtered = filter !== "all" || query.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns or lead lists"
            aria-label="Search campaigns and lead lists"
            className="pl-9"
          />
        </div>
        <div className="min-w-0 overflow-x-auto">
          <SegmentedControl
            aria-label="Filter by status"
            value={filter}
            onValueChange={setFilter}
            options={(Object.keys(FILTERS) as Filter[]).map((key) => ({
              value: key,
              label: (
                <>
                  {FILTER_LABELS[key]}
                  <span className="tabular text-subtle-foreground">
                    {counts[key]}
                  </span>
                </>
              ),
            }))}
          />
        </div>
      </div>

      <TableContainer>
        {visible.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            title="No campaigns match"
            description="Try another search or status filter."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {visible.map((c) => {
                const pct =
                  c.total > 0
                    ? Math.min(100, Math.round((c.sent / c.total) * 100))
                    : 0;
                return (
                  <li key={c.id} className="flex flex-col gap-3 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={`/campaigns/${c.id}`}
                            className="block truncate text-sm font-medium hover:underline"
                          >
                            {c.name}
                          </Link>
                          {c.autopilotRunId ? (
                            <Badge variant="neutral" className="shrink-0">
                              Autopilot
                            </Badge>
                          ) : null}
                        </div>
                        <span className="block truncate text-xs text-subtle-foreground">
                          {c.leadListName ?? "No lead list"} · Created{" "}
                          {c.createdLabel}
                        </span>
                      </div>
                      <CampaignActions
                        id={c.id}
                        status={c.status}
                        name={c.name}
                        isAutopilot={Boolean(c.autopilotRunId)}
                        autopilotRunId={c.autopilotRunId ?? null}
                        failed={c.failed}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <CampaignStatusBadge status={c.status} held={c.held} className="shrink-0" />
                      <Progress
                        value={pct}
                        className="flex-1"
                        aria-label={`${pct}% of leads emailed`}
                      />
                    </div>
                    <div className="tabular flex gap-4 text-xs text-muted-foreground">
                      <span>
                        <span className="font-medium text-foreground">
                          {c.sent.toLocaleString()}
                        </span>{" "}
                        of {c.total.toLocaleString()} emailed
                      </span>
                      <span>
                        <span className="font-medium text-foreground">
                          {c.replied.toLocaleString()}
                        </span>{" "}
                        {c.replied === 1 ? "reply" : "replies"}
                      </span>
                      {c.failed > 0 ? (
                        <span>{c.failed.toLocaleString()} failed</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <Table className="min-w-[780px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[22%]">Progress</TableHead>
                    <TableHead className="text-right">Leads emailed</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((c) => {
                    const pct =
                      c.total > 0
                        ? Math.min(100, Math.round((c.sent / c.total) * 100))
                        : 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-[280px]">
                          <div className="flex min-w-0 items-center gap-2">
                            <Link
                              href={`/campaigns/${c.id}`}
                              className="block truncate font-medium text-foreground hover:underline"
                            >
                              {c.name}
                            </Link>
                            {c.autopilotRunId ? (
                              <Badge variant="neutral" className="shrink-0">
                                Autopilot
                              </Badge>
                            ) : null}
                          </div>
                          <span className="block truncate text-xs text-subtle-foreground">
                            {c.leadListName ?? "No lead list"} ·{" "}
                            {c.total.toLocaleString()}{" "}
                            {c.total === 1 ? "lead" : "leads"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <CampaignStatusBadge status={c.status} held={c.held} />
                          {c.status === "scheduled" && c.scheduledLabel ? (
                            <span className="mt-1 block text-xs text-subtle-foreground">
                              For {c.scheduledLabel}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Progress
                              value={pct}
                              className="flex-1"
                              aria-label={`${pct}% of leads emailed`}
                            />
                            <span className="tabular w-9 shrink-0 text-right text-xs text-muted-foreground">
                              {pct}%
                            </span>
                          </div>
                          {c.failed > 0 ? (
                            <span className="mt-1 block text-xs text-subtle-foreground">
                              {c.failed.toLocaleString()} failed
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right">
                          <span className="font-medium">
                            {c.sent.toLocaleString()}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            / {c.total.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="tabular text-right">
                          <span className="font-medium">
                            {c.replied.toLocaleString()}
                          </span>
                          {c.sent > 0 ? (
                            <span className="block text-xs text-subtle-foreground">
                              {formatPercent(c.replied, c.sent)} rate
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {c.createdLabel}
                        </TableCell>
                        <TableCell className="text-right">
                          <CampaignActions
                            id={c.id}
                            status={c.status}
                            name={c.name}
                            isAutopilot={Boolean(c.autopilotRunId)}
                            autopilotRunId={c.autopilotRunId ?? null}
                            failed={c.failed}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </TableContainer>

      {filtered && visible.length > 0 ? (
        <p className="text-xs text-subtle-foreground" aria-live="polite">
          Showing {visible.length} of {campaigns.length} campaigns
        </p>
      ) : null}

      <div className="pt-4">
        <LeadListsSection lists={leadLists} query={query} />
      </div>
    </div>
  );
}
